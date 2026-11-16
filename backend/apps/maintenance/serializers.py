from rest_framework import serializers

from .models import MaintenancePhoto, MaintenanceRequest, MaintenanceUpdate, Repair


class MaintenancePhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = MaintenancePhoto
        fields = ["id", "image", "phase", "caption", "created_at"]
        read_only_fields = ["created_at"]


class MaintenanceUpdateSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.full_name", read_only=True, default=None)
    author_role = serializers.CharField(source="author.role", read_only=True, default=None)

    class Meta:
        model = MaintenanceUpdate
        fields = [
            "id", "kind", "from_status", "to_status", "message", "visible_to_tenant", "author_name", "author_role",
            "created_at",
        ]


class RepairSerializer(serializers.ModelSerializer):
    cost = serializers.IntegerField(min_value=0, required=False, default=0)
    unit_name = serializers.CharField(source="unit.name", read_only=True)
    property_id = serializers.IntegerField(source="unit.property_id", read_only=True)
    property_name = serializers.CharField(source="unit.property.name", read_only=True)
    request_reference = serializers.CharField(source="request.reference", read_only=True, default=None)
    expense_id = serializers.SerializerMethodField()

    class Meta:
        model = Repair
        fields = [
            "id", "unit", "unit_name", "property_id", "property_name", "request", "request_reference",
            "description", "provider_name", "provider_phone", "completed_on", "cost", "notes", "expense_id",
            "created_at",
        ]
        read_only_fields = ["request", "created_at"]

    def get_expense_id(self, obj) -> int | None:
        expense = getattr(obj, "expense", None)
        return expense.id if expense else None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["cost"] = instance.cost
        return data


class RecordRepairSerializer(serializers.Serializer):
    description = serializers.CharField()
    provider_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    provider_phone = serializers.CharField(max_length=32, required=False, allow_blank=True)
    completed_on = serializers.DateField()
    cost = serializers.IntegerField(min_value=0, default=0)
    notes = serializers.CharField(required=False, allow_blank=True)
    mark_resolved = serializers.BooleanField(default=True)


class MaintenanceRequestSerializer(serializers.ModelSerializer):
    unit_name = serializers.CharField(source="unit.name", read_only=True)
    property_id = serializers.IntegerField(source="unit.property_id", read_only=True)
    property_name = serializers.CharField(source="unit.property.name", read_only=True)
    reported_by_name = serializers.CharField(source="reported_by.full_name", read_only=True)
    reported_by_role = serializers.CharField(source="reported_by.role", read_only=True)
    photo_count = serializers.SerializerMethodField()
    first_photo = serializers.SerializerMethodField()
    allowed_transitions = serializers.SerializerMethodField()

    class Meta:
        model = MaintenanceRequest
        fields = [
            "id", "reference", "unit", "unit_name", "property_id", "property_name", "reported_by_name",
            "reported_by_role", "category", "location_in_home", "description", "priority", "status",
            "provider_name", "provider_phone", "resolved_at", "closed_at", "resolution_notes", "photo_count",
            "first_photo", "allowed_transitions", "created_at", "updated_at",
        ]
        read_only_fields = [
            "reference", "status", "resolved_at", "closed_at", "resolution_notes", "created_at", "updated_at",
        ]
        extra_kwargs = {"unit": {"required": False}}

    def get_photo_count(self, obj) -> int:
        return len(obj.photos.all())

    def get_first_photo(self, obj) -> str | None:
        photos = obj.photos.all()
        return photos[0].image.url if photos else None

    def get_allowed_transitions(self, obj):
        user = self.context["request"].user
        if user.role == "tenant":
            return []
        return sorted(MaintenanceRequest.TRANSITIONS.get(obj.status, set()))

    def validate_description(self, value):
        value = value.strip()
        if len(value) < 5:
            raise serializers.ValidationError("Please describe the problem in a few words.", code="too_short")
        return value


class MaintenanceRequestDetailSerializer(MaintenanceRequestSerializer):
    photos = MaintenancePhotoSerializer(many=True, read_only=True)
    updates = serializers.SerializerMethodField()
    repair = serializers.SerializerMethodField()
    reported_by_phone = serializers.SerializerMethodField()

    class Meta(MaintenanceRequestSerializer.Meta):
        fields = MaintenanceRequestSerializer.Meta.fields + ["photos", "updates", "repair", "reported_by_phone"]

    def _is_tenant(self):
        return self.context["request"].user.role == "tenant"

    def get_updates(self, obj):
        updates = obj.updates.select_related("author")
        if self._is_tenant():
            updates = updates.filter(visible_to_tenant=True)
        return MaintenanceUpdateSerializer(updates, many=True).data

    def get_repair(self, obj):
        repair = getattr(obj, "repair", None)
        if repair is None:
            return None
        data = RepairSerializer(repair, context=self.context).data
        if self._is_tenant():
            # Tenants see that the repair was done, not what it cost.
            for key in ("cost", "expense_id", "notes", "provider_phone"):
                data.pop(key, None)
        return data

    def get_reported_by_phone(self, obj) -> str | None:
        if self._is_tenant():
            return None
        return obj.reported_by.phone


class StatusChangeSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=MaintenanceRequest.Status.choices)
    message = serializers.CharField(required=False, allow_blank=True)


class NoteSerializer(serializers.Serializer):
    message = serializers.CharField()
    visible_to_tenant = serializers.BooleanField(default=True)


class StaffRequestUpdateSerializer(serializers.Serializer):
    priority = serializers.ChoiceField(choices=MaintenanceRequest.Priority.choices, required=False)
    provider_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    provider_phone = serializers.CharField(max_length=32, required=False, allow_blank=True)
