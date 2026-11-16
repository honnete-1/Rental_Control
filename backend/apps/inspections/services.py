"""Digital Property Passport: a single, chronological record of one unit."""

from django.db.models import Sum

from .models import Condition, Inspection

SEVERITY = {Condition.DAMAGED: 3, Condition.NEEDS_ATTENTION: 2, Condition.GOOD: 1, Condition.NOT_CHECKED: 0}


def _latest_completed(unit):
    # Works with prefetched inspections when available.
    completed = [i for i in unit.inspections.all() if i.status == Inspection.Status.COMPLETED]
    if not completed:
        return None
    return sorted(completed, key=lambda i: (i.inspection_date, i.created_at), reverse=True)[0]


def latest_condition_summary(unit):
    inspection = _latest_completed(unit)
    if inspection is None:
        return None
    counts = {c: 0 for c in Condition.values}
    for item in inspection.items.all():
        counts[item.condition] += 1
    if counts[Condition.DAMAGED]:
        overall = Condition.DAMAGED
    elif counts[Condition.NEEDS_ATTENTION]:
        overall = Condition.NEEDS_ATTENTION
    elif counts[Condition.GOOD]:
        overall = Condition.GOOD
    else:
        overall = Condition.NOT_CHECKED
    return {
        "inspection_id": inspection.id,
        "inspection_date": inspection.inspection_date,
        "inspection_type": inspection.inspection_type,
        "overall": overall,
        "counts": counts,
    }


def _rooms(inspection):
    rooms = {}
    for item in inspection.items.all():
        room = rooms.setdefault(item.area, {"area": item.area, "condition": Condition.NOT_CHECKED, "items": []})
        room["items"].append({"element": item.element, "condition": item.condition, "notes": item.notes})
        if SEVERITY[item.condition] > SEVERITY[room["condition"]]:
            room["condition"] = item.condition
    return list(rooms.values())


def build_passport(unit, request, include_costs=True):
    from apps.finance.models import Expense
    from apps.maintenance.models import MaintenanceRequest

    inspections = list(
        unit.inspections.prefetch_related("items", "photos").order_by("-inspection_date", "-created_at")
    )
    latest = next((i for i in inspections if i.status == Inspection.Status.COMPLETED), None)
    requests = list(
        unit.maintenance_requests.select_related("reported_by", "repair").prefetch_related("photos").order_by("-created_at")
    )
    repairs = list(unit.repairs.select_related("request", "expense").order_by("-completed_on"))
    active = unit.tenancies.filter(moved_out_on__isnull=True).select_related("tenant").first()

    photos = []
    for inspection in inspections:
        if inspection.status != Inspection.Status.COMPLETED:
            continue
        for photo in inspection.photos.all():
            photos.append(
                {
                    "id": f"i{photo.id}",
                    "url": photo.image.url,
                    "date": inspection.inspection_date,
                    "source": "inspection",
                    "source_id": inspection.id,
                    "inspection_type": inspection.inspection_type,
                    "area": photo.area,
                    "caption": photo.caption,
                }
            )
    for req in requests:
        for photo in req.photos.all():
            photos.append(
                {
                    "id": f"m{photo.id}",
                    "url": photo.image.url,
                    "date": photo.created_at.date(),
                    "source": "maintenance",
                    "source_id": req.id,
                    "phase": photo.phase,
                    "area": req.location_in_home,
                    "caption": photo.caption or req.get_category_display(),
                    "reference": req.reference,
                }
            )
    photos.sort(key=lambda p: p["date"], reverse=True)

    repair_total = 0
    if include_costs:
        repair_total = (
            Expense.objects.filter(unit=unit, category=Expense.Category.REPAIR).aggregate(t=Sum("amount"))["t"] or 0
        )

    open_statuses = MaintenanceRequest.OPEN_STATUSES
    return {
        "unit": {
            "id": unit.id,
            "name": unit.name,
            "unit_type": unit.unit_type,
            "bedrooms": unit.bedrooms,
            "bathrooms": unit.bathrooms,
            "property_id": unit.property_id,
            "property_name": unit.property.name,
            "property_photo": unit.property.photo.url if unit.property.photo else None,
            "monthly_rent": unit.monthly_rent if include_costs else None,
        },
        "current_tenant": (
            {"id": active.tenant.id, "full_name": active.tenant.full_name, "since": active.start_date} if active else None
        ),
        "latest_condition": (
            {
                "inspection_id": latest.id,
                "inspection_date": latest.inspection_date,
                "inspection_type": latest.inspection_type,
                "rooms": _rooms(latest),
                "summary": latest.summary,
            }
            if latest
            else None
        ),
        "inspections": [
            {
                "id": i.id,
                "inspection_type": i.inspection_type,
                "inspection_date": i.inspection_date,
                "inspector_name": i.inspector_name,
                "status": i.status,
                "photo_count": len(i.photos.all()),
                "problem_count": sum(
                    1 for it in i.items.all() if it.condition in (Condition.DAMAGED, Condition.NEEDS_ATTENTION)
                ),
            }
            for i in inspections
        ],
        "maintenance": [
            {
                "id": r.id,
                "reference": r.reference,
                "category": r.category,
                "description": r.description,
                "status": r.status,
                "priority": r.priority,
                "created_at": r.created_at,
                "resolved_at": r.resolved_at,
            }
            for r in requests
        ],
        "repairs": [
            {
                "id": rp.id,
                "description": rp.description,
                "provider_name": rp.provider_name,
                "completed_on": rp.completed_on,
                "cost": rp.cost if include_costs else None,
                "request_id": rp.request_id,
                "request_reference": rp.request.reference if rp.request else None,
            }
            for rp in repairs
        ],
        "photos": photos,
        "totals": {
            "open_requests": sum(1 for r in requests if r.status in open_statuses),
            "completed_repairs": len(repairs),
            "repair_cost": repair_total if include_costs else None,
            "inspections": sum(1 for i in inspections if i.status == Inspection.Status.COMPLETED),
        },
    }
