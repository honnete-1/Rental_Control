from rest_framework import serializers

from apps.properties.access import finance_properties

from .models import Expense, RentPayment


class ExpenseSerializer(serializers.ModelSerializer):
    property_name = serializers.CharField(source="property.name", read_only=True)
    unit_name = serializers.CharField(source="unit.name", read_only=True, default=None)
    maintenance_reference = serializers.CharField(source="maintenance_request.reference", read_only=True, default=None)
    is_repair_cost = serializers.SerializerMethodField()

    class Meta:
        model = Expense
        fields = [
            "id", "property", "property_name", "unit", "unit_name", "category", "amount", "currency", "spent_on",
            "description", "maintenance_request", "maintenance_reference", "repair", "is_repair_cost", "receipt",
            "created_at",
        ]
        read_only_fields = ["currency", "repair", "created_at"]

    def get_is_repair_cost(self, obj) -> bool:
        return obj.repair_id is not None

    def validate_property(self, value):
        if not finance_properties(self.context["request"].user).filter(pk=value.pk).exists():
            raise serializers.ValidationError("You cannot record expenses for this property.", code="not_allowed")
        return value

    def validate(self, attrs):
        prop = attrs.get("property") or getattr(self.instance, "property", None)
        unit = attrs.get("unit", getattr(self.instance, "unit", None))
        req = attrs.get("maintenance_request", getattr(self.instance, "maintenance_request", None))
        if unit and prop and unit.property_id != prop.pk:
            raise serializers.ValidationError({"unit": ["This unit is not part of the chosen property."]})
        if req and prop and req.unit.property_id != prop.pk:
            raise serializers.ValidationError({"maintenance_request": ["This request is for a different property."]})
        if req and hasattr(req, "repair") and getattr(req.repair, "expense", None) and not self.instance:
            # Prevent double counting: the repair cost is already recorded as an expense.
            raise serializers.ValidationError(
                {"maintenance_request": [serializers.ErrorDetail(
                    "The repair cost for this request is already recorded. Edit the repair instead of adding a second expense.",
                    code="already_counted",
                )]}
            )
        return attrs


class RentPaymentSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source="tenancy.tenant.full_name", read_only=True)
    unit_name = serializers.CharField(source="tenancy.unit.name", read_only=True)
    property_id = serializers.IntegerField(source="tenancy.unit.property_id", read_only=True)
    property_name = serializers.CharField(source="tenancy.unit.property.name", read_only=True)

    class Meta:
        model = RentPayment
        fields = [
            "id", "tenancy", "tenant_name", "unit_name", "property_id", "property_name", "amount", "paid_on",
            "method", "reference", "notes", "created_at",
        ]
        read_only_fields = ["created_at"]

    def validate_tenancy(self, value):
        if not finance_properties(self.context["request"].user).filter(pk=value.unit.property_id).exists():
            raise serializers.ValidationError("You cannot record payments for this tenant.", code="not_allowed")
        return value

    def validate(self, attrs):
        tenancy = attrs.get("tenancy") or getattr(self.instance, "tenancy", None)
        paid_on = attrs.get("paid_on")
        if tenancy and paid_on and paid_on < tenancy.start_date.replace(day=1):
            raise serializers.ValidationError(
                {"paid_on": [serializers.ErrorDetail("This date is before the tenant moved in.", code="before_tenancy")]}
            )
        return attrs
