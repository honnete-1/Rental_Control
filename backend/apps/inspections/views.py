from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.accounts.models import User
from apps.core.audit import audit
from apps.core.exceptions import BusinessRuleError
from apps.core.throttles import UploadThrottle
from apps.notifications.services import notify
from apps.properties.access import managed_units

from .models import Inspection, InspectionPhoto
from .serializers import (
    InspectionDetailSerializer,
    InspectionListSerializer,
    InspectionPhotoSerializer,
    RoomSerializer,
    TenantInspectionSerializer,
)


class InspectionViewSet(viewsets.ModelViewSet):
    """Property condition records. Staff create and complete them; tenants read the ones shared with them."""

    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def is_tenant(self):
        return getattr(self.request.user, "role", None) == User.Role.TENANT

    def get_queryset(self):
        user = self.request.user
        if self.is_tenant():
            qs = Inspection.objects.filter(
                tenancy__tenant=user, shared_with_tenant=True, status=Inspection.Status.COMPLETED
            )
        else:
            qs = Inspection.objects.filter(unit__in=managed_units(user))
        qs = qs.select_related("unit__property").prefetch_related("items", "photos")
        params = self.request.query_params
        if params.get("unit"):
            qs = qs.filter(unit_id=params["unit"])
        if params.get("property"):
            qs = qs.filter(unit__property_id=params["property"])
        if params.get("status"):
            qs = qs.filter(status=params["status"])
        return qs

    def get_serializer_class(self):
        if self.is_tenant():
            return TenantInspectionSerializer
        if self.action == "list":
            return InspectionListSerializer
        return InspectionDetailSerializer

    def _require_staff(self):
        if self.is_tenant() or getattr(self.request.user, "role", None) not in (User.Role.LANDLORD, User.Role.MANAGER):
            raise PermissionDenied("Only landlords and managers can record inspections.", code="staff_only")

    def _require_draft(self, inspection):
        if inspection.is_locked:
            raise BusinessRuleError(
                "This inspection is completed and kept as a permanent record. It cannot be changed.",
                code="inspection_locked",
            )

    def create(self, request, *args, **kwargs):
        self._require_staff()
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        self._require_staff()
        return super().update(request, *args, **kwargs)

    def perform_create(self, serializer):
        inspection = serializer.save(
            created_by=self.request.user,
            inspector_name=serializer.validated_data.get("inspector_name") or self.request.user.full_name,
        )
        audit(self.request, "inspection.created", inspection, property_id=inspection.unit.property_id)

    def perform_update(self, serializer):
        self._require_staff()
        self._require_draft(serializer.instance)
        serializer.save()

    def perform_destroy(self, instance):
        self._require_staff()
        self._require_draft(instance)
        audit(self.request, "inspection.deleted", instance, property_id=instance.unit.property_id)
        for photo in instance.photos.all():
            photo.image.delete(save=False)
        instance.delete()

    @extend_schema(request=RoomSerializer(many=True), responses=InspectionDetailSerializer)
    @action(detail=True, methods=["post"])
    def rooms(self, request, pk=None):
        """Adds rooms (with their checklist) to a draft inspection."""
        self._require_staff()
        inspection = self.get_object()
        self._require_draft(inspection)
        serializer = InspectionDetailSerializer(
            inspection, data={"rooms": request.data.get("rooms", [])}, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        inspection = self.get_queryset().get(pk=inspection.pk)
        return Response(InspectionDetailSerializer(inspection, context={"request": request}).data)

    @extend_schema(request={"multipart/form-data": InspectionPhotoSerializer}, responses={201: InspectionPhotoSerializer})
    @action(detail=True, methods=["post"], throttle_classes=[UploadThrottle])
    def photos(self, request, pk=None):
        self._require_staff()
        inspection = self.get_object()
        self._require_draft(inspection)
        serializer = InspectionPhotoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        photo = serializer.save(inspection=inspection, uploaded_by=request.user)
        return Response(InspectionPhotoSerializer(photo).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["delete"], url_path=r"photos/(?P<photo_id>\d+)")
    def delete_photo(self, request, pk=None, photo_id=None):
        self._require_staff()
        inspection = self.get_object()
        self._require_draft(inspection)
        photo = InspectionPhoto.objects.filter(inspection=inspection, pk=photo_id).first()
        if photo is None:
            raise NotFound()
        photo.image.delete(save=False)
        photo.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        """Locks the inspection as a permanent, dated record."""
        self._require_staff()
        inspection = self.get_object()
        self._require_draft(inspection)
        if not inspection.items.exists():
            raise BusinessRuleError("Please add at least one room before finishing.", code="inspection_empty")
        inspection.status = Inspection.Status.COMPLETED
        inspection.completed_at = timezone.now()
        inspection.save(update_fields=["status", "completed_at", "updated_at"])
        audit(request, "inspection.completed", inspection, property_id=inspection.unit.property_id)
        if inspection.shared_with_tenant and inspection.tenancy and inspection.tenancy.is_active:
            notify(
                [inspection.tenancy.tenant],
                "inspection_shared",
                link=f"/tenant/inspections/{inspection.pk}",
                unit=inspection.unit.name,
                date=str(inspection.inspection_date),
                type=inspection.inspection_type,
            )
        inspection = self.get_queryset().get(pk=inspection.pk)
        return Response(InspectionDetailSerializer(inspection, context={"request": request}).data)
