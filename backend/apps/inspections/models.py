from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel
from apps.core.uploads import inspection_photo_path, validate_image


class Condition(models.TextChoices):
    GOOD = "good", "Good"
    NEEDS_ATTENTION = "needs_attention", "Needs attention"
    DAMAGED = "damaged", "Damaged"
    NOT_CHECKED = "not_checked", "Not checked"


class Inspection(TimeStampedModel):
    class InspectionType(models.TextChoices):
        MOVE_IN = "move_in", "Move-in"
        PERIODIC = "periodic", "Regular check"
        MOVE_OUT = "move_out", "Move-out"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        COMPLETED = "completed", "Completed"

    unit = models.ForeignKey("properties.Unit", on_delete=models.PROTECT, related_name="inspections")
    # The tenancy at the time of the inspection. Used so a tenant only sees inspections from their own stay.
    tenancy = models.ForeignKey(
        "properties.Tenancy", on_delete=models.SET_NULL, null=True, blank=True, related_name="inspections"
    )
    inspection_type = models.CharField(max_length=16, choices=InspectionType.choices)
    inspection_date = models.DateField()
    inspector_name = models.CharField(max_length=150)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.DRAFT, db_index=True)
    summary = models.TextField(blank=True)
    shared_with_tenant = models.BooleanField(default=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-inspection_date", "-created_at"]

    def __str__(self):
        return f"{self.get_inspection_type_display()} — {self.unit} ({self.inspection_date})"

    @property
    def is_locked(self):
        """Completed inspections are evidence and cannot be edited."""
        return self.status == self.Status.COMPLETED


class InspectionItem(models.Model):
    class Element(models.TextChoices):
        GENERAL = "general", "General condition"
        DOORS_WINDOWS = "doors_windows", "Doors and windows"
        PLUMBING = "plumbing", "Plumbing (water)"
        ELECTRICAL = "electrical", "Electricity"
        WALLS_CEILING = "walls_ceiling", "Walls and ceiling"
        FLOORING = "flooring", "Floor"
        FIXTURES = "fixtures", "Fixtures and fittings"

    inspection = models.ForeignKey(Inspection, on_delete=models.CASCADE, related_name="items")
    area = models.CharField(max_length=60, help_text="Room or area, e.g. Kitchen")
    element = models.CharField(max_length=20, choices=Element.choices)
    condition = models.CharField(max_length=20, choices=Condition.choices, default=Condition.NOT_CHECKED)
    notes = models.TextField(blank=True)
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]
        constraints = [
            models.UniqueConstraint(fields=["inspection", "area", "element"], name="unique_item_per_area_element")
        ]


class InspectionPhoto(models.Model):
    inspection = models.ForeignKey(Inspection, on_delete=models.CASCADE, related_name="photos")
    area = models.CharField(max_length=60, blank=True)
    image = models.ImageField(upload_to=inspection_photo_path, validators=[validate_image])
    caption = models.CharField(max_length=255, blank=True)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
