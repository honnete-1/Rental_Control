from django.db import transaction
from django.utils import timezone

from apps.core.exceptions import BusinessRuleError
from apps.notifications.services import notify, property_staff

from .models import MaintenanceRequest, MaintenanceUpdate, Repair


def _tenant_of(req):
    """The reporting tenant, but only while they still live there."""
    if req.tenancy and req.tenancy.is_active and req.reported_by.role == "tenant":
        return req.reported_by
    return None


def change_status(req, new_status, author, message="", visible_to_tenant=True):
    if new_status == req.status:
        return req
    if not req.can_transition_to(new_status):
        raise BusinessRuleError(
            f"A request that is '{req.get_status_display()}' cannot be moved to this step.",
            code="invalid_transition",
        )
    old = req.status
    req.status = new_status
    now = timezone.now()
    fields = ["status", "updated_at"]
    if new_status == MaintenanceRequest.Status.RESOLVED:
        req.resolved_at = now
        fields.append("resolved_at")
        if message:
            req.resolution_notes = message
            fields.append("resolution_notes")
    elif new_status == MaintenanceRequest.Status.CLOSED:
        req.closed_at = now
        fields.append("closed_at")
    elif old in (MaintenanceRequest.Status.RESOLVED, MaintenanceRequest.Status.CLOSED):
        # Re-opened.
        req.resolved_at = None
        req.closed_at = None
        fields += ["resolved_at", "closed_at"]
    req.save(update_fields=fields)
    MaintenanceUpdate.objects.create(
        request=req,
        author=author,
        kind=MaintenanceUpdate.Kind.STATUS_CHANGED,
        from_status=old,
        to_status=new_status,
        message=message,
        visible_to_tenant=visible_to_tenant,
    )
    tenant = _tenant_of(req)
    if tenant and tenant.pk != author.pk:
        notify([tenant], "request_status", link=f"/tenant/requests/{req.pk}", reference=req.reference, status=new_status)
    return req


def add_note(req, author, message, visible_to_tenant=True):
    is_tenant = author.role == "tenant"
    update = MaintenanceUpdate.objects.create(
        request=req,
        author=author,
        kind=MaintenanceUpdate.Kind.NOTE,
        message=message.strip(),
        visible_to_tenant=True if is_tenant else visible_to_tenant,
    )
    if is_tenant:
        notify(
            [u for u in property_staff(req.unit.property)],
            "request_note",
            link=f"/landlord/maintenance/{req.pk}",
            dedupe_minutes=30,
            reference=req.reference,
            author=author.full_name,
        )
    elif visible_to_tenant:
        tenant = _tenant_of(req)
        if tenant:
            notify([tenant], "request_note", link=f"/tenant/requests/{req.pk}", dedupe_minutes=30,
                   reference=req.reference, author=author.full_name)
    return update


@transaction.atomic
def record_repair(req, author, data):
    """Stores the completed repair and its cost (as one linked expense) and resolves the request."""
    from apps.finance.models import Expense

    if hasattr(req, "repair"):
        raise BusinessRuleError("A repair is already recorded for this request. You can edit it instead.", code="repair_exists")
    if req.status == MaintenanceRequest.Status.CLOSED:
        raise BusinessRuleError("This request is closed. Re-open it before recording a repair.", code="request_closed")
    repair = Repair.objects.create(
        unit=req.unit,
        request=req,
        description=data["description"].strip(),
        provider_name=data.get("provider_name", "") or req.provider_name,
        provider_phone=data.get("provider_phone", "") or req.provider_phone,
        completed_on=data["completed_on"],
        notes=data.get("notes", ""),
        created_by=author,
    )
    if data.get("cost"):
        Expense.objects.create(
            property=req.unit.property,
            unit=req.unit,
            category=Expense.Category.REPAIR,
            amount=data["cost"],
            spent_on=data["completed_on"],
            description=f"{req.reference}: {repair.description[:200]}",
            maintenance_request=req,
            repair=repair,
            created_by=author,
        )
    MaintenanceUpdate.objects.create(
        request=req,
        author=author,
        kind=MaintenanceUpdate.Kind.REPAIR_RECORDED,
        message=repair.description,
        visible_to_tenant=True,
    )
    if data.get("mark_resolved", True) and req.status != MaintenanceRequest.Status.RESOLVED:
        if req.status in (MaintenanceRequest.Status.NEW, MaintenanceRequest.Status.UNDER_REVIEW):
            change_status(req, MaintenanceRequest.Status.APPROVED, author, visible_to_tenant=False)
        change_status(req, MaintenanceRequest.Status.RESOLVED, author, message=repair.description)
    tenant = _tenant_of(req)
    if tenant:
        notify([tenant], "repair_completed", link=f"/tenant/requests/{req.pk}", reference=req.reference)
    return repair


@transaction.atomic
def update_repair_cost(repair, author, new_cost, spent_on=None):
    """Keeps the single linked expense in sync with the repair cost."""
    from apps.finance.models import Expense

    expense = getattr(repair, "expense", None)
    if new_cost and expense:
        expense.amount = new_cost
        if spent_on:
            expense.spent_on = spent_on
        expense.save(update_fields=["amount", "spent_on", "updated_at"])
    elif new_cost and not expense:
        Expense.objects.create(
            property=repair.unit.property,
            unit=repair.unit,
            category=Expense.Category.REPAIR,
            amount=new_cost,
            spent_on=spent_on or repair.completed_on,
            description=(f"{repair.request.reference}: " if repair.request else "") + repair.description[:200],
            maintenance_request=repair.request,
            repair=repair,
            created_by=author,
        )
    elif not new_cost and expense:
        expense.delete()
