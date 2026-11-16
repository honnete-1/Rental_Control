from datetime import datetime, time

from django.db import transaction
from django.db.models import Case, IntegerField, Q, Value, When
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.accounts.models import User
from apps.core.audit import audit
from apps.core.exceptions import BusinessRuleError
from apps.core.permissions import IsPropertyStaff
from apps.core.throttles import UploadThrottle
from apps.notifications.services import notify, property_staff
from apps.properties.access import active_tenancies, finance_properties, managed_units

from . import services
from .models import MaintenancePhoto, MaintenanceRequest, MaintenanceUpdate, Repair
from .serializers import (
    MaintenancePhotoSerializer,
    MaintenanceRequestDetailSerializer,
    MaintenanceRequestSerializer,
    NoteSerializer,
    RecordRepairSerializer,
    RepairSerializer,
    StaffRequestUpdateSerializer,
    StatusChangeSerializer,
)

PRIORITY_ORDER = Case(
    When(priority="urgent", then=Value(0)), When(priority="normal", then=Value(1)), default=Value(2),
    output_field=IntegerField(),
)


def _parse_date(value, field):
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        raise ValidationError({field: ["Please use the format YYYY-MM-DD."]})


class MaintenanceRequestViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet
):
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def is_tenant(self):
        return getattr(self.request.user, "role", None) == User.Role.TENANT

    def is_staff(self):
        return getattr(self.request.user, "role", None) in (User.Role.LANDLORD, User.Role.MANAGER)

    def get_queryset(self):
        user = self.request.user
        if self.is_tenant():
            # Only requests from the tenant's own tenancies - never those of earlier or other tenants.
            qs = MaintenanceRequest.objects.filter(tenancy__tenant=user, reported_by=user)
        elif self.is_staff():
            qs = MaintenanceRequest.objects.filter(unit__in=managed_units(user))
        else:
            qs = MaintenanceRequest.objects.none()
        qs = qs.select_related("unit__property", "reported_by", "tenancy").prefetch_related("photos")
        p = self.request.query_params
        if p.get("status"):
            qs = qs.filter(status__in=p["status"].split(","))
        if p.get("open") == "true":
            qs = qs.filter(status__in=MaintenanceRequest.OPEN_STATUSES)
        if p.get("priority"):
            qs = qs.filter(priority__in=p["priority"].split(","))
        if p.get("category"):
            qs = qs.filter(category=p["category"])
        if p.get("property"):
            qs = qs.filter(unit__property_id=p["property"])
        if p.get("unit"):
            qs = qs.filter(unit_id=p["unit"])
        tz = timezone.get_current_timezone()
        if p.get("date_from"):
            start = timezone.make_aware(datetime.combine(_parse_date(p["date_from"], "date_from"), time.min), tz)
            qs = qs.filter(created_at__gte=start)
        if p.get("date_to"):
            end = timezone.make_aware(datetime.combine(_parse_date(p["date_to"], "date_to"), time.max), tz)
            qs = qs.filter(created_at__lte=end)
        if p.get("search"):
            s = p["search"].strip()
            qs = qs.filter(Q(reference__icontains=s) | Q(description__icontains=s) | Q(unit__name__icontains=s))
        if p.get("ordering") == "priority":
            return qs.annotate(prio=PRIORITY_ORDER).order_by("prio", "-created_at")
        return qs.order_by("-created_at")

    def get_serializer_class(self):
        if self.action == "list":
            return MaintenanceRequestSerializer
        return MaintenanceRequestDetailSerializer

    def perform_create(self, serializer):
        user = self.request.user
        if self.is_tenant():
            tenancy = active_tenancies(user).select_related("unit__property").first()
            if tenancy is None:
                raise BusinessRuleError(
                    "Your account is not linked to a home yet. Ask your landlord to invite you.", code="no_home"
                )
            unit = tenancy.unit
        elif self.is_staff():
            unit = serializer.validated_data.get("unit")
            if unit is None or not managed_units(user).filter(pk=unit.pk).exists():
                raise ValidationError({"unit": ["Please choose one of your units."]})
            tenancy = unit.tenancies.filter(moved_out_on__isnull=True).first()
        else:
            raise PermissionDenied()
        with transaction.atomic():
            req = serializer.save(unit=unit, tenancy=tenancy, reported_by=user)
            MaintenanceUpdate.objects.create(request=req, author=user, kind=MaintenanceUpdate.Kind.REPORTED)
            photos = self.request.FILES.getlist("photos")
            for f in photos[:6]:
                photo_ser = MaintenancePhotoSerializer(data={"image": f, "phase": MaintenancePhoto.Phase.REPORTED})
                photo_ser.is_valid(raise_exception=True)
                photo_ser.save(request=req, uploaded_by=user)
        audit(self.request, "maintenance.created", req, property_id=unit.property_id, reference=req.reference)
        staff = [u for u in property_staff(unit.property) if u.pk != user.pk]
        notify(
            staff,
            "request_created",
            link=f"/landlord/maintenance/{req.pk}",
            reference=req.reference,
            unit=unit.name,
            property=unit.property.name,
            category=req.category,
            priority=req.priority,
        )

    def _require_staff(self):
        if not self.is_staff():
            raise PermissionDenied("Only your landlord or manager can do this.", code="staff_only")

    @extend_schema(request=StaffRequestUpdateSerializer, responses=MaintenanceRequestDetailSerializer)
    def partial_update(self, request, pk=None):
        self._require_staff()
        req = self.get_object()
        serializer = StaffRequestUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if "priority" in data and data["priority"] != req.priority:
            MaintenanceUpdate.objects.create(
                request=req, author=request.user, kind=MaintenanceUpdate.Kind.PRIORITY_CHANGED,
                message=data["priority"], visible_to_tenant=True,
            )
            req.priority = data["priority"]
        provider_changed = any(k in data and data[k] != getattr(req, k) for k in ("provider_name", "provider_phone"))
        for key in ("provider_name", "provider_phone"):
            if key in data:
                setattr(req, key, data[key].strip())
        if provider_changed and req.provider_name:
            MaintenanceUpdate.objects.create(
                request=req, author=request.user, kind=MaintenanceUpdate.Kind.PROVIDER_ASSIGNED,
                message=req.provider_name, visible_to_tenant=True,
            )
        req.save()
        audit(request, "maintenance.updated", req, property_id=req.unit.property_id, fields=sorted(data))
        return Response(MaintenanceRequestDetailSerializer(req, context={"request": request}).data)

    @extend_schema(request=StatusChangeSerializer, responses=MaintenanceRequestDetailSerializer)
    @action(detail=True, methods=["post"], url_path="status")
    def change_status(self, request, pk=None):
        self._require_staff()
        req = self.get_object()
        serializer = StatusChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        old = req.status
        services.change_status(
            req, serializer.validated_data["status"], request.user, serializer.validated_data.get("message", "")
        )
        audit(request, "maintenance.status_changed", req, property_id=req.unit.property_id, old=old, new=req.status)
        return Response(MaintenanceRequestDetailSerializer(req, context={"request": request}).data)

    @extend_schema(request=NoteSerializer, responses={201: MaintenanceRequestDetailSerializer})
    @action(detail=True, methods=["post"])
    def notes(self, request, pk=None):
        req = self.get_object()
        serializer = NoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not serializer.validated_data["message"].strip():
            raise ValidationError({"message": ["Please write a message."]})
        services.add_note(req, request.user, serializer.validated_data["message"], serializer.validated_data["visible_to_tenant"])
        return Response(MaintenanceRequestDetailSerializer(req, context={"request": request}).data, status=status.HTTP_201_CREATED)

    @extend_schema(request={"multipart/form-data": MaintenancePhotoSerializer}, responses={201: MaintenancePhotoSerializer})
    @action(detail=True, methods=["post"], throttle_classes=[UploadThrottle])
    def photos(self, request, pk=None):
        req = self.get_object()
        if self.is_tenant() and req.status == MaintenanceRequest.Status.CLOSED:
            raise BusinessRuleError("This request is closed.", code="request_closed")
        if req.photos.count() >= 20:
            raise BusinessRuleError("This request already has the maximum number of photos.", code="too_many_photos")
        data = {"image": request.data.get("image"), "caption": request.data.get("caption", "")}
        data["phase"] = request.data.get("phase", "reported") if self.is_staff() else MaintenancePhoto.Phase.REPORTED
        serializer = MaintenancePhotoSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        photo = serializer.save(request=req, uploaded_by=request.user)
        MaintenanceUpdate.objects.create(
            request=req, author=request.user, kind=MaintenanceUpdate.Kind.PHOTO_ADDED, message=photo.phase
        )
        return Response(MaintenancePhotoSerializer(photo).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=RecordRepairSerializer, responses={201: MaintenanceRequestDetailSerializer})
    @action(detail=True, methods=["post"])
    def repair(self, request, pk=None):
        self._require_staff()
        req = self.get_object()
        serializer = RecordRepairSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if data.get("cost") and not finance_properties(request.user).filter(pk=req.unit.property_id).exists():
            raise PermissionDenied("You do not have permission to record costs for this property.", code="no_finance_access")
        repair = services.record_repair(req, request.user, data)
        audit(request, "repair.recorded", repair, property_id=req.unit.property_id, cost=data.get("cost", 0))
        req.refresh_from_db()
        return Response(MaintenanceRequestDetailSerializer(req, context={"request": request}).data, status=status.HTTP_201_CREATED)


class RepairViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """Completed repairs. Repairs can also be recorded without a tenant request (e.g. found during an inspection)."""

    serializer_class = RepairSerializer
    permission_classes = [IsPropertyStaff]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        qs = Repair.objects.filter(unit__in=managed_units(self.request.user)).select_related("unit__property", "request", "expense")
        p = self.request.query_params
        if p.get("property"):
            qs = qs.filter(unit__property_id=p["property"])
        if p.get("unit"):
            qs = qs.filter(unit_id=p["unit"])
        return qs

    def _check_finance(self, unit, cost):
        if cost and not finance_properties(self.request.user).filter(pk=unit.property_id).exists():
            raise PermissionDenied("You do not have permission to record costs for this property.", code="no_finance_access")

    def perform_create(self, serializer):
        unit = serializer.validated_data["unit"]
        if not managed_units(self.request.user).filter(pk=unit.pk).exists():
            raise ValidationError({"unit": ["Please choose one of your units."]})
        cost = serializer.validated_data.pop("cost", 0)
        self._check_finance(unit, cost)
        with transaction.atomic():
            repair = serializer.save(created_by=self.request.user)
            services.update_repair_cost(repair, self.request.user, cost)
        audit(self.request, "repair.recorded", repair, property_id=unit.property_id, cost=cost)

    def perform_update(self, serializer):
        repair = serializer.instance
        if "unit" in serializer.validated_data and serializer.validated_data["unit"] != repair.unit:
            raise ValidationError({"unit": ["The unit of a repair cannot be changed."]})
        cost = serializer.validated_data.pop("cost", None)
        old_cost = repair.cost
        with transaction.atomic():
            repair = serializer.save()
            if cost is not None and cost != old_cost:
                self._check_finance(repair.unit, cost or old_cost)
                services.update_repair_cost(repair, self.request.user, cost)
        audit(self.request, "repair.updated", repair, property_id=repair.unit.property_id, old_cost=old_cost, new_cost=repair.cost)
