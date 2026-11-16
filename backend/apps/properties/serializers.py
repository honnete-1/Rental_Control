from django.utils import timezone
from rest_framework import serializers

from apps.accounts.models import User

from .models import Property, PropertyManagerAssignment, Tenancy, TenantInvitation, Unit


class PersonSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "full_name", "email", "phone"]


class PropertySerializer(serializers.ModelSerializer):
    unit_count = serializers.IntegerField(read_only=True)
    occupied_count = serializers.IntegerField(read_only=True)
    open_requests = serializers.IntegerField(read_only=True)
    urgent_requests = serializers.IntegerField(read_only=True)
    owner_name = serializers.CharField(source="owner.full_name", read_only=True)
    is_owner = serializers.SerializerMethodField()
    remove_photo = serializers.BooleanField(write_only=True, required=False)

    class Meta:
        model = Property
        fields = [
            "id", "name", "property_type", "address", "district", "city", "description", "notes", "photo",
            "unit_count", "occupied_count", "open_requests", "urgent_requests", "owner_name", "is_owner",
            "created_at", "updated_at", "remove_photo", "is_demo",
        ]
        read_only_fields = ["created_at", "updated_at", "is_demo"]

    def get_is_owner(self, obj) -> bool:
        return obj.owner_id == self.context["request"].user.pk

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Please give the property a name.", code="required")
        return value

    def update(self, instance, validated_data):
        if validated_data.pop("remove_photo", False):
            instance.photo.delete(save=False)
            instance.photo = ""
        return super().update(instance, validated_data)

    def create(self, validated_data):
        validated_data.pop("remove_photo", None)
        return super().create(validated_data)


class UnitSerializer(serializers.ModelSerializer):
    property_name = serializers.CharField(source="property.name", read_only=True)
    occupancy = serializers.SerializerMethodField()
    current_tenancy = serializers.SerializerMethodField()
    pending_invitation = serializers.SerializerMethodField()
    open_requests = serializers.IntegerField(read_only=True, default=0)
    latest_condition = serializers.SerializerMethodField()

    class Meta:
        model = Unit
        fields = [
            "id", "property", "property_name", "name", "unit_type", "bedrooms", "bathrooms", "monthly_rent",
            "notes", "occupancy", "current_tenancy", "pending_invitation", "open_requests", "latest_condition",
            "created_at",
        ]
        read_only_fields = ["created_at"]

    def _active(self, obj):
        if not hasattr(obj, "_active_cache"):
            obj._active_cache = next((t for t in obj.tenancies.all() if t.moved_out_on is None), None)
        return obj._active_cache

    def _pending(self, obj):
        now = timezone.now()
        return next(
            (i for i in obj.invitations.all() if not i.accepted_at and not i.cancelled_at and i.expires_at > now),
            None,
        )

    def get_occupancy(self, obj) -> str:
        if self._active(obj):
            return "occupied"
        if self._pending(obj):
            return "invited"
        return "vacant"

    def get_current_tenancy(self, obj):
        tenancy = self._active(obj)
        return TenancySerializer(tenancy, context=self.context).data if tenancy else None

    def get_pending_invitation(self, obj):
        inv = self._pending(obj)
        return InvitationSerializer(inv, context=self.context).data if inv else None

    def get_latest_condition(self, obj):
        from apps.inspections.services import latest_condition_summary

        return latest_condition_summary(obj)

    def validate_property(self, value):
        from .access import managed_properties

        if not managed_properties(self.context["request"].user).filter(pk=value.pk).exists():
            raise serializers.ValidationError("You cannot add units to this property.", code="not_allowed")
        return value

    def validate(self, attrs):
        prop = attrs.get("property") or getattr(self.instance, "property", None)
        name = (attrs.get("name") or getattr(self.instance, "name", "")).strip()
        if prop and name:
            qs = Unit.objects.filter(property=prop, name__iexact=name)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError(
                    {"name": [serializers.ErrorDetail("This property already has a unit with this name.", code="duplicate_unit")]}
                )
        if "name" in attrs:
            attrs["name"] = name
        if self.instance and "property" in attrs and attrs["property"] != self.instance.property:
            raise serializers.ValidationError({"property": ["A unit cannot be moved to another property."]})
        return attrs


class TenancySerializer(serializers.ModelSerializer):
    tenant = PersonSerializer(read_only=True)
    unit_name = serializers.CharField(source="unit.name", read_only=True)
    property_id = serializers.IntegerField(source="unit.property_id", read_only=True)
    property_name = serializers.CharField(source="unit.property.name", read_only=True)
    is_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = Tenancy
        fields = [
            "id", "unit", "unit_name", "property_id", "property_name", "tenant", "start_date", "lease_end_date",
            "moved_out_on", "monthly_rent", "rent_due_day", "share_payments_with_tenant", "is_active",
        ]
        read_only_fields = ["unit", "moved_out_on"]

    def validate(self, attrs):
        start = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end = attrs.get("lease_end_date", getattr(self.instance, "lease_end_date", None))
        if start and end and end < start:
            raise serializers.ValidationError(
                {"lease_end_date": [serializers.ErrorDetail("The end date must be after the start date.", code="end_before_start")]}
            )
        return attrs


class InvitationSerializer(serializers.ModelSerializer):
    status = serializers.CharField(read_only=True)
    unit_name = serializers.CharField(source="unit.name", read_only=True)
    property_name = serializers.CharField(source="unit.property.name", read_only=True)

    class Meta:
        model = TenantInvitation
        fields = [
            "id", "unit", "unit_name", "property_name", "full_name", "email", "phone", "start_date",
            "lease_end_date", "monthly_rent", "rent_due_day", "status", "expires_at", "accepted_at", "created_at",
        ]
        read_only_fields = ["unit", "expires_at", "accepted_at", "created_at"]


class InviteTenantSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True)
    start_date = serializers.DateField()
    lease_end_date = serializers.DateField(required=False, allow_null=True)
    monthly_rent = serializers.IntegerField(min_value=0, required=False)
    rent_due_day = serializers.IntegerField(min_value=1, max_value=28, default=5)

    def validate_email(self, value):
        value = value.strip().lower()
        existing = User.objects.filter(email__iexact=value).first()
        if existing and existing.role != User.Role.TENANT:
            raise serializers.ValidationError(
                "This email belongs to a landlord or manager account. Please use the tenant's own email.",
                code="not_tenant_email",
            )
        return value

    def validate(self, attrs):
        if attrs.get("lease_end_date") and attrs["lease_end_date"] < attrs["start_date"]:
            raise serializers.ValidationError(
                {"lease_end_date": [serializers.ErrorDetail("The end date must be after the start date.", code="end_before_start")]}
            )
        return attrs


class MoveOutSerializer(serializers.Serializer):
    moved_out_on = serializers.DateField()


class ManagerAssignmentSerializer(serializers.ModelSerializer):
    manager = PersonSerializer(read_only=True)
    email = serializers.EmailField(write_only=True)

    class Meta:
        model = PropertyManagerAssignment
        fields = ["id", "manager", "email", "can_view_finances", "is_active", "created_at"]
        read_only_fields = ["is_active", "created_at"]

    def validate_email(self, value):
        user = User.objects.filter(email__iexact=value.strip(), role=User.Role.MANAGER, is_active=True).first()
        if user is None:
            raise serializers.ValidationError(
                "We could not find a property manager account with this email. Ask them to sign up first.",
                code="manager_not_found",
            )
        return user
