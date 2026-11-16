from django.db import transaction
from django.db.models import Count, Exists, OuterRef, Prefetch, Q
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.core.audit import audit
from apps.core.exceptions import BusinessRuleError
from apps.core.permissions import IsLandlord, IsPropertyStaff, IsTenant
from apps.maintenance.models import MaintenanceRequest
from apps.notifications.services import notify

from . import access
from .models import Property, PropertyManagerAssignment, Tenancy, TenantInvitation, Unit
from .serializers import (
    InvitationSerializer,
    InviteTenantSerializer,
    ManagerAssignmentSerializer,
    MoveOutSerializer,
    PropertySerializer,
    TenancySerializer,
    UnitSerializer,
)
from .services import invitation_link, send_invitation_email

OPEN = MaintenanceRequest.OPEN_STATUSES


def annotate_properties(qs):
    return qs.select_related("owner").annotate(
        unit_count=Count("units", distinct=True),
        occupied_count=Count("units__tenancies", filter=Q(units__tenancies__moved_out_on__isnull=True), distinct=True),
        open_requests=Count(
            "units__maintenance_requests", filter=Q(units__maintenance_requests__status__in=OPEN), distinct=True
        ),
        urgent_requests=Count(
            "units__maintenance_requests",
            filter=Q(units__maintenance_requests__status__in=OPEN, units__maintenance_requests__priority="urgent"),
            distinct=True,
        ),
    )


def unit_queryset(qs):
    return (
        qs.select_related("property")
        .prefetch_related(
            Prefetch("tenancies", queryset=Tenancy.objects.select_related("tenant", "unit__property")),
            "invitations",
            "inspections__items",
        )
        .annotate(open_requests=Count("maintenance_requests", filter=Q(maintenance_requests__status__in=OPEN), distinct=True))
    )


class PropertyViewSet(viewsets.ModelViewSet):
    serializer_class = PropertySerializer
    permission_classes = [IsPropertyStaff]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        qs = annotate_properties(access.managed_properties(self.request.user))
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(district__icontains=search) | Q(address__icontains=search))
        return qs.order_by("name")

    def perform_create(self, serializer):
        if self.request.user.role != "landlord":
            raise PermissionDenied("Only property owners can add properties.", code="owner_only")
        prop = serializer.save(owner=self.request.user)
        audit(self.request, "property.created", prop, property_id=prop.pk, name=prop.name)

    def perform_update(self, serializer):
        prop = serializer.save()
        audit(self.request, "property.updated", prop, property_id=prop.pk, fields=sorted(serializer.validated_data))

    def perform_destroy(self, instance):
        if instance.owner_id != self.request.user.pk:
            raise PermissionDenied("Only the owner can delete this property.", code="owner_only")
        has_history = (
            Tenancy.objects.filter(unit__property=instance).exists()
            or instance.expenses.exists()
            or MaintenanceRequest.objects.filter(unit__property=instance).exists()
            or Unit.objects.filter(property=instance, inspections__isnull=False).exists()
        )
        if has_history:
            raise BusinessRuleError(
                "This property has tenants, inspections, repairs or expenses recorded, so it cannot be deleted. "
                "Its history is kept for your records.",
                code="property_has_history",
            )
        audit(self.request, "property.deleted", instance, property_id=instance.pk, name=instance.name)
        instance.delete()

    @extend_schema(responses=ManagerAssignmentSerializer(many=True))
    @action(detail=True, methods=["get", "post"], serializer_class=ManagerAssignmentSerializer, parser_classes=[JSONParser])
    def managers(self, request, pk=None):
        prop = self.get_object()
        if prop.owner_id != request.user.pk:
            raise PermissionDenied("Only the owner can manage who helps with this property.", code="owner_only")
        if request.method == "GET":
            data = ManagerAssignmentSerializer(prop.manager_assignments.filter(is_active=True).select_related("manager"), many=True).data
            return Response(data)
        serializer = ManagerAssignmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        manager = serializer.validated_data["email"]
        assignment, _ = PropertyManagerAssignment.objects.update_or_create(
            property=prop,
            manager=manager,
            defaults={
                "is_active": True,
                "can_view_finances": serializer.validated_data.get("can_view_finances", False),
                "assigned_by": request.user,
            },
        )
        audit(request, "property.manager_assigned", assignment, property_id=prop.pk, manager=manager.email)
        notify([manager], "manager_assigned", link=f"/landlord/properties/{prop.pk}", property=prop.name)
        return Response(ManagerAssignmentSerializer(assignment).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["delete"], url_path=r"managers/(?P<assignment_id>\d+)")
    def remove_manager(self, request, pk=None, assignment_id=None):
        prop = self.get_object()
        if prop.owner_id != request.user.pk:
            raise PermissionDenied("Only the owner can manage who helps with this property.", code="owner_only")
        assignment = prop.manager_assignments.filter(pk=assignment_id).first()
        if not assignment:
            raise NotFound()
        assignment.is_active = False
        assignment.save(update_fields=["is_active", "updated_at"])
        audit(request, "property.manager_removed", assignment, property_id=prop.pk)
        return Response(status=status.HTTP_204_NO_CONTENT)


class UnitViewSet(viewsets.ModelViewSet):
    serializer_class = UnitSerializer
    permission_classes = [IsPropertyStaff]

    def get_queryset(self):
        qs = unit_queryset(access.managed_units(self.request.user))
        params = self.request.query_params
        if params.get("property"):
            qs = qs.filter(property_id=params["property"])
        if params.get("occupancy") in ("vacant", "occupied"):
            active = Tenancy.objects.filter(unit=OuterRef("pk"), moved_out_on__isnull=True)
            qs = qs.annotate(is_occupied=Exists(active)).filter(is_occupied=params["occupancy"] == "occupied")
        return qs.order_by("property__name", "name")

    def perform_create(self, serializer):
        unit = serializer.save()
        audit(self.request, "unit.created", unit, property_id=unit.property_id, name=unit.name)

    def perform_update(self, serializer):
        unit = serializer.save()
        audit(self.request, "unit.updated", unit, property_id=unit.property_id, fields=sorted(serializer.validated_data))

    def perform_destroy(self, instance):
        if (
            instance.tenancies.exists()
            or instance.inspections.exists()
            or instance.maintenance_requests.exists()
            or instance.expenses.exists()
        ):
            raise BusinessRuleError(
                "This unit has history (tenants, inspections, repairs or expenses), so it cannot be deleted.",
                code="unit_has_history",
            )
        audit(self.request, "unit.deleted", instance, property_id=instance.property_id, name=instance.name)
        instance.delete()

    @extend_schema(request=InviteTenantSerializer, responses={201: dict})
    @action(detail=True, methods=["post"])
    def invite(self, request, pk=None):
        """Creates a single-use invitation link for a new tenant of this unit."""
        unit = self.get_object()
        if unit.tenancies.filter(moved_out_on__isnull=True).exists():
            raise BusinessRuleError(
                "Someone already lives in this unit. Record their move-out first.", code="unit_occupied"
            )
        serializer = InviteTenantSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        with transaction.atomic():
            # Only one open invitation per unit: cancel older ones.
            unit.invitations.filter(accepted_at__isnull=True, cancelled_at__isnull=True).update(cancelled_at=timezone.now())
            invitation = TenantInvitation(
                unit=unit,
                full_name=data["full_name"].strip(),
                email=data["email"],
                phone=data.get("phone", ""),
                start_date=data["start_date"],
                lease_end_date=data.get("lease_end_date"),
                monthly_rent=data.get("monthly_rent") if data.get("monthly_rent") is not None else (unit.monthly_rent or 0),
                rent_due_day=data.get("rent_due_day", 5),
                created_by=request.user,
            )
            token = invitation.issue_token()
            invitation.save()
        send_invitation_email(invitation, token)
        audit(request, "invitation.created", invitation, property_id=unit.property_id, email=invitation.email)
        body = InvitationSerializer(invitation).data
        body["invite_link"] = invitation_link(token)
        return Response(body, status=status.HTTP_201_CREATED)

    @extend_schema(request=MoveOutSerializer, responses=TenancySerializer)
    @action(detail=True, methods=["post"], url_path="move-out")
    def move_out(self, request, pk=None):
        unit = self.get_object()
        tenancy = unit.tenancies.filter(moved_out_on__isnull=True).first()
        if tenancy is None:
            raise BusinessRuleError("Nobody is living in this unit right now.", code="unit_vacant")
        serializer = MoveOutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        moved_out_on = serializer.validated_data["moved_out_on"]
        if moved_out_on < tenancy.start_date:
            raise BusinessRuleError("The move-out date must be after the move-in date.", code="end_before_start")
        tenancy.moved_out_on = moved_out_on
        tenancy.save(update_fields=["moved_out_on", "updated_at"])
        audit(request, "tenancy.ended", tenancy, property_id=unit.property_id, moved_out_on=str(moved_out_on))
        return Response(TenancySerializer(tenancy).data)

    @action(detail=True, methods=["get"])
    def passport(self, request, pk=None):
        """The Digital Property Passport: everything recorded about this unit over time."""
        from apps.inspections.services import build_passport

        unit = self.get_object()
        include_finance = access.finance_properties(request.user).filter(pk=unit.property_id).exists()
        return Response(build_passport(unit, request, include_costs=include_finance))


class TenancyViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """Tenants across the user's properties (current and past)."""

    serializer_class = TenancySerializer
    permission_classes = [IsPropertyStaff]
    http_method_names = ["get", "patch", "head", "options"]

    def get_queryset(self):
        qs = Tenancy.objects.filter(unit__in=access.managed_units(self.request.user)).select_related(
            "tenant", "unit__property"
        )
        params = self.request.query_params
        if params.get("active") == "true":
            qs = qs.filter(moved_out_on__isnull=True)
        elif params.get("active") == "false":
            qs = qs.filter(moved_out_on__isnull=False)
        if params.get("property"):
            qs = qs.filter(unit__property_id=params["property"])
        if params.get("search"):
            s = params["search"]
            qs = qs.filter(Q(tenant__full_name__icontains=s) | Q(tenant__email__icontains=s) | Q(unit__name__icontains=s))
        return qs.order_by("moved_out_on", "unit__property__name", "unit__name")

    def perform_update(self, serializer):
        tenancy = serializer.save()
        audit(self.request, "tenancy.updated", tenancy, property_id=tenancy.unit.property_id, fields=sorted(serializer.validated_data))


class InvitationViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = InvitationSerializer
    permission_classes = [IsPropertyStaff]

    def get_queryset(self):
        qs = TenantInvitation.objects.filter(unit__in=access.managed_units(self.request.user)).select_related("unit__property")
        if self.request.query_params.get("pending") == "true":
            qs = qs.filter(accepted_at__isnull=True, cancelled_at__isnull=True, expires_at__gt=timezone.now())
        return qs

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        invitation = self.get_object()
        if invitation.status != TenantInvitation.Status.PENDING:
            raise BusinessRuleError("This invitation is no longer open.", code="invitation_closed")
        invitation.cancelled_at = timezone.now()
        invitation.save(update_fields=["cancelled_at", "updated_at"])
        audit(request, "invitation.cancelled", invitation, property_id=invitation.unit.property_id)
        return Response(InvitationSerializer(invitation).data)

    @action(detail=True, methods=["post"], url_path="new-link")
    def new_link(self, request, pk=None):
        """Issues a fresh link (the old one stops working). Useful if the link was lost."""
        invitation = self.get_object()
        if invitation.accepted_at or invitation.cancelled_at:
            raise BusinessRuleError("This invitation is no longer open.", code="invitation_closed")
        token = invitation.issue_token()
        invitation.save(update_fields=["token_hash", "expires_at", "updated_at"])
        send_invitation_email(invitation, token)
        audit(request, "invitation.new_link", invitation, property_id=invitation.unit.property_id)
        body = InvitationSerializer(invitation).data
        body["invite_link"] = invitation_link(token)
        return Response(body)


@extend_schema(responses=dict)
@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated, IsTenant])
def my_home(request):
    """The tenant's current home, with only the information a tenant should see."""
    tenancy = access.active_tenancies(request.user).select_related("unit__property__owner").first()
    if tenancy is None:
        return Response({"tenancy": None})
    unit = tenancy.unit
    prop = unit.property
    return Response(
        {
            "tenancy": {
                "id": tenancy.id,
                "start_date": tenancy.start_date,
                "lease_end_date": tenancy.lease_end_date,
                "monthly_rent": tenancy.monthly_rent,
                "rent_due_day": tenancy.rent_due_day,
                "share_payments_with_tenant": tenancy.share_payments_with_tenant,
            },
            "unit": {
                "id": unit.id,
                "name": unit.name,
                "unit_type": unit.unit_type,
                "bedrooms": unit.bedrooms,
                "bathrooms": unit.bathrooms,
            },
            "property": {
                "id": prop.id,
                "name": prop.name,
                "address": prop.address,
                "district": prop.district,
                "city": prop.city,
                "photo": prop.photo.url if prop.photo else None,
            },
            "landlord": {"full_name": prop.owner.full_name, "phone": prop.owner.phone, "email": prop.owner.email},
        }
    )
