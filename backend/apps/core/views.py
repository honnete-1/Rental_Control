import mimetypes

from django.core.files.storage import default_storage
from django.db.models import Exists, OuterRef, Q, Sum
from django.http import FileResponse, Http404, JsonResponse
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core.models import AuditLog
from apps.core.permissions import IsPropertyStaff, IsTenant
from apps.properties import access


def health(request):
    return JsonResponse({"status": "ok"})


def _can_access_file(user, name):
    """Checks the signed-in user may see an uploaded file, based on the record that owns it."""
    from apps.finance.models import Expense
    from apps.inspections.models import InspectionPhoto
    from apps.maintenance.models import MaintenancePhoto
    from apps.properties.models import Property

    if not user.is_authenticated:
        return False
    managed = access.managed_properties(user)
    if name.startswith("properties/"):
        prop = Property.objects.filter(photo=name).first()
        if prop is None:
            return False
        return managed.filter(pk=prop.pk).exists() or access.active_tenancies(user).filter(unit__property=prop).exists()
    if name.startswith("inspections/"):
        photo = InspectionPhoto.objects.select_related("inspection__unit", "inspection__tenancy").filter(image=name).first()
        if photo is None:
            return False
        inspection = photo.inspection
        if managed.filter(pk=inspection.unit.property_id).exists():
            return True
        return bool(
            inspection.tenancy
            and inspection.tenancy.tenant_id == user.pk
            and inspection.shared_with_tenant
            and inspection.status == "completed"
        )
    if name.startswith("maintenance/"):
        photo = MaintenancePhoto.objects.select_related("request__unit", "request__tenancy").filter(image=name).first()
        if photo is None:
            return False
        req = photo.request
        if managed.filter(pk=req.unit.property_id).exists():
            return True
        return req.reported_by_id == user.pk and req.tenancy and req.tenancy.tenant_id == user.pk
    if name.startswith("receipts/"):
        expense = Expense.objects.filter(receipt=name).first()
        return bool(expense) and access.finance_properties(user).filter(pk=expense.property_id).exists()
    return False


def protected_media(request, file_path):
    name = file_path.replace("\\", "/")
    if ".." in name.split("/") or not _can_access_file(request.user, name):
        raise Http404()
    if not default_storage.exists(name):
        raise Http404()
    content_type = mimetypes.guess_type(name)[0] or "application/octet-stream"
    response = FileResponse(default_storage.open(name, "rb"), content_type=content_type)
    response["Cache-Control"] = "private, max-age=3600"
    response["X-Content-Type-Options"] = "nosniff"
    return response


@extend_schema(responses=dict)
@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated, IsPropertyStaff])
def landlord_dashboard(request):
    """Everything on the Overview page, computed from stored records."""
    from apps.finance.models import Expense, RentPayment
    from apps.finance.services import financial_summary
    from apps.maintenance.models import MaintenanceRequest, Repair
    from apps.properties.models import Tenancy, Unit

    user = request.user
    props = access.managed_properties(user)
    units = Unit.objects.filter(property__in=props)
    unit_count = units.count()
    occupied = Tenancy.objects.filter(unit__in=units, moved_out_on__isnull=True).count()
    open_qs = MaintenanceRequest.objects.filter(unit__in=units, status__in=MaintenanceRequest.OPEN_STATUSES)

    # "Needs your attention", most urgent first.
    attention = []
    for req in open_qs.select_related("unit__property").order_by("-created_at")[:50]:
        score = {"urgent": 0, "normal": 2, "low": 3}[req.priority]
        if req.status == "new":
            score -= 0.5
        attention.append(
            {
                "type": "maintenance",
                "id": req.id,
                "reference": req.reference,
                "category": req.category,
                "priority": req.priority,
                "status": req.status,
                "unit_name": req.unit.name,
                "property_name": req.unit.property.name,
                "created_at": req.created_at,
                "link": f"/landlord/maintenance/{req.id}",
                "score": score,
            }
        )

    finance_props = access.finance_properties(user)
    today = timezone.localdate()
    period_from = today.replace(day=1)
    finance = None
    if finance_props.exists():
        summary = financial_summary(finance_props, period_from, today)
        from apps.finance.services import tenancy_ledger

        overdue = []
        for tenancy in Tenancy.objects.filter(unit__property__in=finance_props, moved_out_on__isnull=True, monthly_rent__gt=0).select_related("tenant", "unit__property"):
            ledger = tenancy_ledger(tenancy)
            if ledger["overdue_count"]:
                overdue.append(
                    {
                        "type": "rent_overdue",
                        "id": tenancy.id,
                        "tenant_name": tenancy.tenant.full_name,
                        "unit_name": tenancy.unit.name,
                        "property_name": tenancy.unit.property.name,
                        "outstanding": ledger["outstanding"],
                        "link": f"/landlord/rent/{tenancy.id}",
                        "score": 1,
                    }
                )
        attention.extend(overdue)
        finance = {
            "period_from": period_from,
            "period_to": today,
            "rent_received": summary["rent_received"],
            "rent_due": summary["rent_due"],
            "outstanding": summary["outstanding"],
            "maintenance_expenses": summary["maintenance_expenses"],
            "total_expenses": summary["total_expenses"],
            "net_cash_flow": summary["net_cash_flow"],
            "overdue_tenants": len(overdue),
        }
    attention.sort(key=lambda a: (a["score"], str(a.get("created_at", ""))))

    # Vacant units are worth knowing about but come after problems.
    vacant_units = [
        {"type": "vacant_unit", "id": u.id, "unit_name": u.name, "property_name": u.property.name,
         "link": f"/landlord/units/{u.id}", "score": 5}
        for u in units.annotate(
            is_occupied=Exists(Tenancy.objects.filter(unit=OuterRef("pk"), moved_out_on__isnull=True))
        ).filter(is_occupied=False).select_related("property")[:5]
    ]

    recent_repairs = [
        {
            "id": r.id,
            "description": r.description,
            "unit_name": r.unit.name,
            "property_name": r.unit.property.name,
            "completed_on": r.completed_on,
            "cost": r.cost if finance_props.filter(pk=r.unit.property_id).exists() else None,
            "request_id": r.request_id,
        }
        for r in Repair.objects.filter(unit__in=units).select_related("unit__property", "expense").order_by("-completed_on")[:5]
    ]

    activity = [
        {"id": a.id, "action": a.action, "actor": a.actor.full_name if a.actor else None, "details": a.details,
         "created_at": a.created_at, "object_type": a.object_type, "object_id": a.object_id}
        for a in AuditLog.objects.filter(property_id__in=props.values("pk")).select_related("actor")[:10]
    ]

    return Response(
        {
            "properties": props.count(),
            "units": unit_count,
            "occupied_units": occupied,
            "vacant_units": unit_count - occupied,
            "open_requests": open_qs.count(),
            "urgent_requests": open_qs.filter(priority="urgent").count(),
            "new_requests": open_qs.filter(status="new").count(),
            "needs_attention": attention[:8] + vacant_units[: max(0, 8 - len(attention))],
            "recent_repairs": recent_repairs,
            "maintenance_spending_this_month": (
                Expense.objects.filter(property__in=finance_props, category="repair", spent_on__gte=period_from).aggregate(t=Sum("amount"))["t"] or 0
            ) if finance_props.exists() else None,
            "finance": finance,
            "recent_activity": activity,
        }
    )


@extend_schema(responses=dict)
@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated, IsTenant])
def tenant_dashboard(request):
    from apps.maintenance.models import MaintenanceRequest
    from apps.notifications.models import Notification

    tenancy = access.active_tenancies(request.user).select_related("unit__property").first()
    requests = MaintenanceRequest.objects.filter(tenancy__tenant=request.user, reported_by=request.user)
    active = requests.filter(status__in=MaintenanceRequest.OPEN_STATUSES).order_by("-created_at")[:5]
    notifications = Notification.objects.filter(recipient=request.user)[:5]
    return Response(
        {
            "home": (
                {"unit_id": tenancy.unit_id, "unit_name": tenancy.unit.name, "property_name": tenancy.unit.property.name,
                 "district": tenancy.unit.property.district, "city": tenancy.unit.property.city,
                 "photo": tenancy.unit.property.photo.url if tenancy.unit.property.photo else None}
                if tenancy
                else None
            ),
            "active_requests": [
                {"id": r.id, "reference": r.reference, "category": r.category, "status": r.status,
                 "description": r.description, "created_at": r.created_at, "updated_at": r.updated_at}
                for r in active
            ],
            "open_count": requests.filter(status__in=MaintenanceRequest.OPEN_STATUSES).count(),
            "resolved_count": requests.filter(status__in=["resolved", "closed"]).count(),
            "notifications": [
                {"id": n.id, "kind": n.kind, "params": n.params, "link": n.link, "is_read": n.read_at is not None,
                 "created_at": n.created_at}
                for n in notifications
            ],
        }
    )


@extend_schema(responses=dict)
@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated, IsPropertyStaff])
def search(request):
    """Quick search for the top bar: properties, units, tenants and maintenance requests."""
    from apps.maintenance.models import MaintenanceRequest
    from apps.properties.models import Tenancy, Unit

    q = (request.query_params.get("q") or "").strip()
    if len(q) < 2:
        return Response({"properties": [], "units": [], "tenants": [], "requests": []})
    props = access.managed_properties(request.user)
    return Response(
        {
            "properties": [{"id": p.id, "name": p.name, "district": p.district}
                           for p in props.filter(Q(name__icontains=q) | Q(district__icontains=q))[:5]],
            "units": [{"id": u.id, "name": u.name, "property_name": u.property.name}
                      for u in Unit.objects.filter(property__in=props, name__icontains=q).select_related("property")[:5]],
            "tenants": [{"id": t.id, "full_name": t.tenant.full_name, "unit_id": t.unit_id, "unit_name": t.unit.name}
                        for t in Tenancy.objects.filter(unit__property__in=props, moved_out_on__isnull=True)
                        .filter(Q(tenant__full_name__icontains=q) | Q(tenant__phone__icontains=q))
                        .select_related("tenant", "unit")[:5]],
            "requests": [{"id": r.id, "reference": r.reference, "category": r.category, "status": r.status}
                         for r in MaintenanceRequest.objects.filter(unit__property__in=props)
                         .filter(Q(reference__icontains=q) | Q(description__icontains=q))[:5]],
        }
    )
