from datetime import date, datetime

from django.db.models import Q, Sum
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, permissions, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.core.audit import audit
from apps.core.exceptions import BusinessRuleError
from apps.core.permissions import IsPropertyStaff, IsTenant
from apps.notifications.services import notify
from apps.properties.access import active_tenancies, finance_properties
from apps.properties.models import Tenancy

from .models import Expense, RentPayment
from .serializers import ExpenseSerializer, RentPaymentSerializer
from .services import financial_summary, tenancy_ledger, today


def require_finance_access(user):
    """Managers without money permission get a clear "not allowed" instead of empty totals."""
    from rest_framework.exceptions import PermissionDenied

    if user.role == "manager" and not finance_properties(user).exists():
        raise PermissionDenied("You do not have permission to see rent and expenses.", code="no_finance_access")


def parse_period(params):
    def parse(name, fallback):
        value = params.get(name)
        if not value:
            return fallback
        try:
            return datetime.strptime(value, "%Y-%m-%d").date()
        except ValueError:
            raise ValidationError({name: ["Please use the format YYYY-MM-DD."]})

    now = today()
    date_from = parse("date_from", date(now.year, now.month, 1))
    date_to = parse("date_to", now)
    if date_to < date_from:
        raise ValidationError({"date_to": ["The end date must be after the start date."]})
    return date_from, date_to


class ExpenseViewSet(viewsets.ModelViewSet):
    serializer_class = ExpenseSerializer
    permission_classes = [IsPropertyStaff]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        qs = Expense.objects.filter(property__in=finance_properties(self.request.user)).select_related(
            "property", "unit", "maintenance_request"
        )
        p = self.request.query_params
        if p.get("property"):
            qs = qs.filter(property_id=p["property"])
        if p.get("unit"):
            qs = qs.filter(unit_id=p["unit"])
        if p.get("category"):
            qs = qs.filter(category=p["category"])
        if p.get("date_from") or p.get("date_to"):
            date_from, date_to = parse_period(p)
            qs = qs.filter(spent_on__range=(date_from, date_to))
        if p.get("search"):
            qs = qs.filter(Q(description__icontains=p["search"]))
        return qs

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        response.data["total_amount"] = self.filter_queryset(self.get_queryset()).aggregate(t=Sum("amount"))["t"] or 0
        return response

    def perform_create(self, serializer):
        expense = serializer.save(created_by=self.request.user)
        audit(self.request, "expense.created", expense, property_id=expense.property_id, amount=expense.amount)

    def perform_update(self, serializer):
        if serializer.instance.repair_id:
            raise BusinessRuleError("This is a repair cost. Change it from the repair record.", code="repair_expense")
        old = serializer.instance.amount
        expense = serializer.save()
        audit(self.request, "expense.updated", expense, property_id=expense.property_id, old_amount=old, new_amount=expense.amount)

    def perform_destroy(self, instance):
        if instance.repair_id:
            raise BusinessRuleError("This is a repair cost. Change it from the repair record.", code="repair_expense")
        audit(self.request, "expense.deleted", instance, property_id=instance.property_id, amount=instance.amount,
              description=instance.description)
        if instance.receipt:
            instance.receipt.delete(save=False)
        instance.delete()


class RentPaymentViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    serializer_class = RentPaymentSerializer
    permission_classes = [IsPropertyStaff]

    def get_queryset(self):
        qs = RentPayment.objects.filter(tenancy__unit__property__in=finance_properties(self.request.user)).select_related(
            "tenancy__tenant", "tenancy__unit__property"
        )
        p = self.request.query_params
        if p.get("tenancy"):
            qs = qs.filter(tenancy_id=p["tenancy"])
        if p.get("property"):
            qs = qs.filter(tenancy__unit__property_id=p["property"])
        if p.get("date_from") or p.get("date_to"):
            date_from, date_to = parse_period(p)
            qs = qs.filter(paid_on__range=(date_from, date_to))
        return qs

    def perform_create(self, serializer):
        payment = serializer.save(recorded_by=self.request.user)
        audit(self.request, "payment.recorded", payment, property_id=payment.tenancy.unit.property_id, amount=payment.amount)
        if payment.tenancy.share_payments_with_tenant and payment.tenancy.is_active:
            notify([payment.tenancy.tenant], "payment_recorded", link="/tenant/payments", amount=payment.amount,
                   date=str(payment.paid_on))

    def perform_destroy(self, instance):
        audit(self.request, "payment.deleted", instance, property_id=instance.tenancy.unit.property_id,
              amount=instance.amount, paid_on=str(instance.paid_on))
        instance.delete()


class RentLedgerViewSet(viewsets.GenericViewSet):
    """Rent status per tenancy: what is due, paid and overdue."""

    permission_classes = [IsPropertyStaff]

    def get_queryset(self):
        return Tenancy.objects.filter(unit__property__in=finance_properties(self.request.user)).select_related(
            "tenant", "unit__property"
        )

    @extend_schema(parameters=[OpenApiParameter("property", int), OpenApiParameter("active", str)], responses=dict)
    def list(self, request):
        require_finance_access(request.user)
        qs = self.get_queryset()
        if request.query_params.get("property"):
            qs = qs.filter(unit__property_id=request.query_params["property"])
        if request.query_params.get("active", "true") == "true":
            qs = qs.filter(moved_out_on__isnull=True)
        rows = []
        for tenancy in qs.order_by("unit__property__name", "unit__name"):
            ledger = tenancy_ledger(tenancy)
            rows.append(
                {
                    "tenancy_id": tenancy.id,
                    "tenant_name": tenancy.tenant.full_name,
                    "tenant_phone": tenancy.tenant.phone,
                    "unit_id": tenancy.unit_id,
                    "unit_name": tenancy.unit.name,
                    "property_id": tenancy.unit.property_id,
                    "property_name": tenancy.unit.property.name,
                    "monthly_rent": tenancy.monthly_rent,
                    "rent_due_day": tenancy.rent_due_day,
                    "is_active": tenancy.is_active,
                    "total_due_to_date": ledger["total_due_to_date"],
                    "total_paid": ledger["total_paid"],
                    "outstanding": ledger["outstanding"],
                    "overdue_count": ledger["overdue_count"],
                    "next_due": next(
                        (c for c in ledger["charges"] if c["status"] in ("due", "upcoming", "partly_paid", "overdue")), None
                    ),
                }
            )
        return Response(rows)

    @extend_schema(responses=dict)
    def retrieve(self, request, pk=None):
        tenancy = self.get_queryset().filter(pk=pk).first()
        if tenancy is None:
            raise NotFound()
        ledger = tenancy_ledger(tenancy)
        payments = RentPaymentSerializer(tenancy.rent_payments.select_related("tenancy__tenant", "tenancy__unit__property"), many=True).data
        return Response(
            {
                "tenancy_id": tenancy.id,
                "tenant_name": tenancy.tenant.full_name,
                "unit_name": tenancy.unit.name,
                "property_name": tenancy.unit.property.name,
                "monthly_rent": tenancy.monthly_rent,
                "rent_due_day": tenancy.rent_due_day,
                "start_date": tenancy.start_date,
                "is_active": tenancy.is_active,
                **ledger,
                "payments": payments,
            }
        )


@extend_schema(
    parameters=[OpenApiParameter("date_from", str), OpenApiParameter("date_to", str), OpenApiParameter("property", int)],
    responses=dict,
)
@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated, IsPropertyStaff])
def finance_summary(request):
    require_finance_access(request.user)
    date_from, date_to = parse_period(request.query_params)
    props = finance_properties(request.user)
    if request.query_params.get("property"):
        props = props.filter(pk=request.query_params["property"])
    return Response(financial_summary(props, date_from, date_to))


@extend_schema(responses=dict)
@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated, IsTenant])
def my_payments(request):
    """The tenant's own rent record, when the landlord has chosen to share it."""
    tenancy = active_tenancies(request.user).first()
    if tenancy is None:
        return Response({"enabled": False, "reason": "no_home"})
    if not tenancy.share_payments_with_tenant:
        return Response({"enabled": False, "reason": "not_shared"})
    ledger = tenancy_ledger(tenancy)
    payments = [
        {"id": p.id, "amount": p.amount, "paid_on": p.paid_on, "method": p.method, "reference": p.reference}
        for p in tenancy.rent_payments.all()
    ]
    return Response({"enabled": True, "monthly_rent": tenancy.monthly_rent, "rent_due_day": tenancy.rent_due_day,
                     **ledger, "payments": payments})
