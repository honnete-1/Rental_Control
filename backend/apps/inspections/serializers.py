from rest_framework import serializers

from apps.properties.access import managed_units

from .models import Condition, Inspection, InspectionItem, InspectionPhoto


class InspectionItemSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)

    class Meta:
        model = InspectionItem
        fields = ["id", "area", "element", "condition", "notes", "position"]


class InspectionPhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = InspectionPhoto
        fields = ["id", "area", "image", "caption", "created_at"]
        read_only_fields = ["created_at"]


class RoomSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=60)
    has_water = serializers.BooleanField(default=False)


ROOM_ELEMENTS = [
    InspectionItem.Element.WALLS_CEILING,
    InspectionItem.Element.FLOORING,
    InspectionItem.Element.DOORS_WINDOWS,
    InspectionItem.Element.ELECTRICAL,
    InspectionItem.Element.FIXTURES,
]


def create_room_items(inspection, rooms, start_position=0):
    position = start_position
    items = []
    for room in rooms:
        elements = list(ROOM_ELEMENTS)
        if room.get("has_water"):
            elements.insert(3, InspectionItem.Element.PLUMBING)
        for element in elements:
            items.append(InspectionItem(inspection=inspection, area=room["name"].strip(), element=element, position=position))
            position += 1
    InspectionItem.objects.bulk_create(items, ignore_conflicts=True)


class InspectionListSerializer(serializers.ModelSerializer):
    unit_name = serializers.CharField(source="unit.name", read_only=True)
    property_id = serializers.IntegerField(source="unit.property_id", read_only=True)
    property_name = serializers.CharField(source="unit.property.name", read_only=True)
    counts = serializers.SerializerMethodField()
    photo_count = serializers.SerializerMethodField()

    class Meta:
        model = Inspection
        fields = [
            "id", "unit", "unit_name", "property_id", "property_name", "inspection_type", "inspection_date",
            "inspector_name", "status", "summary", "shared_with_tenant", "counts", "photo_count", "completed_at",
            "created_at",
        ]

    def get_counts(self, obj):
        counts = {c: 0 for c in Condition.values}
        for item in obj.items.all():
            counts[item.condition] += 1
        return counts

    def get_photo_count(self, obj) -> int:
        return len(obj.photos.all())


class InspectionDetailSerializer(InspectionListSerializer):
    items = InspectionItemSerializer(many=True, required=False)
    photos = InspectionPhotoSerializer(many=True, read_only=True)
    rooms = RoomSerializer(many=True, write_only=True, required=False)

    class Meta(InspectionListSerializer.Meta):
        fields = InspectionListSerializer.Meta.fields + ["items", "photos", "rooms"]
        read_only_fields = ["status", "completed_at", "created_at"]
        extra_kwargs = {"inspector_name": {"required": False}}

    def validate_unit(self, value):
        if not managed_units(self.context["request"].user).filter(pk=value.pk).exists():
            raise serializers.ValidationError("You cannot inspect this unit.", code="not_allowed")
        if self.instance and value.pk != self.instance.unit_id:
            raise serializers.ValidationError("The unit of an inspection cannot be changed.", code="not_allowed")
        return value

    def create(self, validated_data):
        rooms = validated_data.pop("rooms", [])
        items = validated_data.pop("items", [])
        unit = validated_data["unit"]
        validated_data["tenancy"] = unit.tenancies.filter(moved_out_on__isnull=True).first()
        inspection = Inspection.objects.create(**validated_data)
        create_room_items(inspection, rooms)
        for i, item in enumerate(items):
            item.pop("id", None)
            InspectionItem.objects.get_or_create(
                inspection=inspection, area=item["area"], element=item["element"],
                defaults={**item, "position": item.get("position", 1000 + i)},
            )
        return inspection

    def update(self, instance, validated_data):
        rooms = validated_data.pop("rooms", [])
        items = validated_data.pop("items", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        if rooms:
            last = instance.items.order_by("-position").values_list("position", flat=True).first() or 0
            create_room_items(instance, rooms, start_position=last + 1)
        if items:
            existing = {i.pk: i for i in instance.items.all()}
            for data in items:
                item = existing.get(data.get("id"))
                if item is None:
                    continue
                item.condition = data.get("condition", item.condition)
                item.notes = data.get("notes", item.notes)
                item.save(update_fields=["condition", "notes"])
        return instance


class TenantInspectionSerializer(InspectionListSerializer):
    """What a tenant may see: the condition record of their own stay, without internal notes."""

    items = InspectionItemSerializer(many=True, read_only=True)
    photos = InspectionPhotoSerializer(many=True, read_only=True)

    class Meta(InspectionListSerializer.Meta):
        fields = InspectionListSerializer.Meta.fields + ["items", "photos"]
