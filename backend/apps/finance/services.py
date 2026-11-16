"""Rent ledger and financial summaries.

Definitions (also shown in the app):
- Rent due: rent charges whose due date falls in the period.
- Rent received: payments recorded with a payment date in the period (cash basis).
- Outstanding: all rent due up to the end of the period, minus all payments up to then.
- Expenses: recorded expenses with a date in the period.
- Net cash flow: rent received minus expenses. It is NOT verified profit: taxes, loan payments,
  depreciation and anything not recorded in Rental_Control are excluded.

All amounts are integers (whole RWF).
"""

import calendar
from datetime import date

from django.db.models import Sum
from django.utils import timezone

from .models import Expense, RentCharge, RentPayment


def today():
    return timezone.localdate()


def _month_start(d):
    return d.replace(day=1)


def _add_month(d):
    return date(d.year + (d.month // 12), d.month % 12 + 1, 1)


def ensure_rent_charges(tenancy, up_to=None):
    """Creates the monthly rent charges of a tenancy up to ``up_to`` (inclusive month)."""
    if not tenancy.monthly_rent:
        return
    up_to = up_to or today()
    last_day = tenancy.moved_out_on or tenancy.lease_end_date
    end = min(up_to, last_day) if last_day else up_to
    period = _month_start(tenancy.start_date)
    existing = set(tenancy.rent_charges.values_list("period_start", flat=True))
    new = []
    while period <= end:
        if period not in existing:
            due_day = min(tenancy.rent_due_day, calendar.monthrange(period.year, period.month)[1])
            due = period.replace(day=due_day)
            # The first month is due on the move-in day at the earliest.
            if due < tenancy.start_date:
                due = tenancy.start_date
            new.append(RentCharge(tenancy=tenancy, period_start=period, due_date=due, amount_due=tenancy.monthly_rent))
        period = _add_month(period)
    if new:
        RentCharge.objects.bulk_create(new, ignore_conflicts=True)


def tenancy_ledger(tenancy, as_of=None):
    """Charges with their paid amount (payments are applied to the oldest charge first)."""
    as_of = as_of or today()
    ensure_rent_charges(tenancy, as_of)
    charges = list(tenancy.rent_charges.order_by("period_start"))
    payments = list(tenancy.rent_payments.order_by("paid_on", "id"))
    available = sum(p.amount for p in payments)
    rows = []
    for charge in charges:
        paid = min(available, charge.amount_due)
        available -= paid
        if paid >= charge.amount_due:
            state = "paid"
        elif charge.due_date < as_of:
            state = "overdue"
        elif paid:
            state = "partly_paid"
        else:
            state = "upcoming" if charge.due_date > as_of else "due"
        rows.append(
            {
                "id": charge.id,
                "period_start": charge.period_start,
                "due_date": charge.due_date,
                "amount_due": charge.amount_due,
                "amount_paid": paid,
                "balance": charge.amount_due - paid,
                "status": state,
            }
        )
    due_so_far = sum(c.amount_due for c in charges if c.due_date <= as_of)
    paid_total = sum(p.amount for p in payments)
    return {
        "charges": rows,
        "total_due_to_date": due_so_far,
        "total_paid": paid_total,
        "outstanding": max(due_so_far - paid_total, 0),
        "credit": max(paid_total - due_so_far, 0),
        "overdue_count": sum(1 for r in rows if r["status"] == "overdue"),
    }


def financial_summary(properties, date_from, date_to):
    """Totals for the given properties and period. ``properties`` is a queryset the user may see."""
    from apps.properties.models import Tenancy, Unit

    tenancies = Tenancy.objects.filter(unit__property__in=properties)
    for tenancy in tenancies.filter(monthly_rent__gt=0):
        ensure_rent_charges(tenancy, min(date_to, today()))

    charges = RentCharge.objects.filter(tenancy__unit__property__in=properties)
    payments = RentPayment.objects.filter(tenancy__unit__property__in=properties)
    expenses = Expense.objects.filter(property__in=properties)

    rent_due = charges.filter(due_date__range=(date_from, date_to)).aggregate(t=Sum("amount_due"))["t"] or 0
    rent_received = payments.filter(paid_on__range=(date_from, date_to)).aggregate(t=Sum("amount"))["t"] or 0
    due_to_end = charges.filter(due_date__lte=min(date_to, today())).aggregate(t=Sum("amount_due"))["t"] or 0
    paid_to_end = payments.filter(paid_on__lte=date_to).aggregate(t=Sum("amount"))["t"] or 0

    period_expenses = expenses.filter(spent_on__range=(date_from, date_to))
    maintenance_total = period_expenses.filter(category__in=Expense.MAINTENANCE_CATEGORIES).aggregate(t=Sum("amount"))["t"] or 0
    other_total = period_expenses.exclude(category__in=Expense.MAINTENANCE_CATEGORIES).aggregate(t=Sum("amount"))["t"] or 0
    by_category = {
        row["category"]: row["total"]
        for row in period_expenses.values("category").annotate(total=Sum("amount")).order_by()
    }

    units = Unit.objects.filter(property__in=properties)
    unit_count = units.count()
    occupied = Tenancy.objects.filter(unit__in=units, moved_out_on__isnull=True).count()

    per_property = []
    for prop in properties.order_by("name"):
        p_received = payments.filter(tenancy__unit__property=prop, paid_on__range=(date_from, date_to)).aggregate(t=Sum("amount"))["t"] or 0
        p_expenses = period_expenses.filter(property=prop).aggregate(t=Sum("amount"))["t"] or 0
        p_due = charges.filter(tenancy__unit__property=prop, due_date__range=(date_from, date_to)).aggregate(t=Sum("amount_due"))["t"] or 0
        per_property.append(
            {
                "property_id": prop.id,
                "property_name": prop.name,
                "rent_due": p_due,
                "rent_received": p_received,
                "expenses": p_expenses,
                "net_cash_flow": p_received - p_expenses,
            }
        )

    # Simple month-by-month series for a bar chart.
    months = []
    cursor = _month_start(date_from)
    while cursor <= date_to and len(months) < 24:
        nxt = _add_month(cursor)
        end = min(date.fromordinal(nxt.toordinal() - 1), date_to)
        start = max(cursor, date_from)
        received = payments.filter(paid_on__range=(start, end)).aggregate(t=Sum("amount"))["t"] or 0
        spent = expenses.filter(spent_on__range=(start, end)).aggregate(t=Sum("amount"))["t"] or 0
        months.append({"month": cursor, "rent_received": received, "expenses": spent})
        cursor = nxt

    return {
        "date_from": date_from,
        "date_to": date_to,
        "currency": "RWF",
        "rent_due": rent_due,
        "rent_received": rent_received,
        "outstanding": max(due_to_end - paid_to_end, 0),
        "maintenance_expenses": maintenance_total,
        "other_expenses": other_total,
        "total_expenses": maintenance_total + other_total,
        "net_cash_flow": rent_received - maintenance_total - other_total,
        "expenses_by_category": by_category,
        "occupancy": {"units": unit_count, "occupied": occupied, "vacant": unit_count - occupied},
        "per_property": per_property,
        "months": months,
        "excluded": ["taxes_not_recorded", "loan_payments", "depreciation", "unrecorded_costs"],
    }
