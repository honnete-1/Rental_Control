from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel
from apps.core.uploads import maintenance_photo_path, validate_image


class MaintenanceRequest(TimeStampedModel):
    class Category(models.TextChoices):
        PLUMBING = "plumbing", "Plumbing (water)"
        ELECTRICITY = "electricity", "Electricity"
        DOORS_WINDOWS = "doors_windows", "Doors and windows"
        WALLS_CEILING = "walls_ceiling", "Walls and ceiling"
        APPLIANCES = "appliances", "Appliances"
        OTHER = "other", "Other"

    class Priority(models.TextChoices):
        LOW = "low", "Can wait"
        NORMAL = "normal", "Normal"
        URGENT = "urgent", "Urgent"

    class Status(models.TextChoices):
        NEW = "new", "New"
        UNDER_REVIEW = "under_review", "Under review"
        APPROVED = "approved", "Approved"
        IN_PROGRESS = "in_progress", "In progress"
        RESOLVED = "resolved", "Resolved"
        CLOSED = "closed", "Closed"

    OPEN_STATUSES = (Status.NEW, Status.UNDER_REVIEW, Status.APPROVED, Status.IN_PROGRESS)

    # Allowed status changes. Anything else is refused by the API.
    TRANSITIONS = {
        Status.NEW: {Status.UNDER_REVIEW, Status.APPROVED, Status.CLOSED},
        Status.UNDER_REVIEW: {Status.APPROVED, Status.CLOSED},
        Status.APPROVED: {Status.IN_PROGRESS, Status.RESOLVED, Status.CLOSED},
        Status.IN_PROGRESS: {Status.RESOLVED},
        Status.RESOLVED: {Status.CLOSED, Status.IN_PROGRESS},
        Status.CLOSED: {Status.UNDER_REVIEW},
    }

    reference = models.CharField(max_length=20, unique=True, null=True, blank=True, editable=False)
    unit = models.ForeignKey("properties.Unit", on_delete=models.PROTECT, related_name="maintenance_requests")
    tenancy = models.ForeignKey(
        "properties.Tenancy", on_delete=models.SET_NULL, null=True, blank=True, related_name="maintenance_requests"
    )
    reported_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="reported_requests")
    category = models.CharField(max_length=20, choices=Category.choices)
    location_in_home = models.CharField(max_length=80, blank=True, help_text="e.g. Kitchen")
    description = models.TextField()
    priority = models.CharField(max_length=10, choices=Priority.choices, default=Priority.NORMAL, db_index=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.NEW, db_index=True)
    provider_name = models.CharField(max_length=150, blank=True)
    provider_phone = models.CharField(max_length=32, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    resolution_notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["unit", "status"])]

    def __str__(self):
        return f"{self.reference} {self.get_category_display()}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if not self.reference:
            self.reference = f"RC-{self.pk:05d}"
            super().save(update_fields=["reference"])

    @property
    def is_open(self):
        return self.status in self.OPEN_STATUSES

    def can_transition_to(self, new_status):
        return new_status in self.TRANSITIONS.get(self.status, set())


class MaintenanceUpdate(models.Model):
    """One entry in a request's timeline. Entries are never edited or deleted."""

    class Kind(models.TextChoices):
        REPORTED = "reported", "Reported"
        STATUS_CHANGED = "status_changed", "Status changed"
        NOTE = "note", "Note"
        PHOTO_ADDED = "photo_added", "Photo added"
        REPAIR_RECORDED = "repair_recorded", "Repair recorded"
        PROVIDER_ASSIGNED = "provider_assigned", "Repair person assigned"
        PRIORITY_CHANGED = "priority_changed", "Priority changed"

    request = models.ForeignKey(MaintenanceRequest, on_delete=models.CASCADE, related_name="updates")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")
    kind = models.CharField(max_length=20, choices=Kind.choices)
    from_status = models.CharField(max_length=16, blank=True)
    to_status = models.CharField(max_length=16, blank=True)
    message = models.TextField(blank=True)
    visible_to_tenant = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["created_at", "id"]


class MaintenancePhoto(models.Model):
    class Phase(models.TextChoices):
        REPORTED = "reported", "When reported"
        BEFORE = "before", "Before repair"
        AFTER = "after", "After repair"

    request = models.ForeignKey(MaintenanceRequest, on_delete=models.CASCADE, related_name="photos")
    image = models.ImageField(upload_to=maintenance_photo_path, validators=[validate_image])
    phase = models.CharField(max_length=10, choices=Phase.choices, default=Phase.REPORTED)
    caption = models.CharField(max_length=255, blank=True)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]


class Repair(TimeStampedModel):
    """A completed repair. Its cost is stored once, as a linked Expense, so it is never counted twice."""

    unit = models.ForeignKey("properties.Unit", on_delete=models.PROTECT, related_name="repairs")
    request = models.OneToOneField(
        MaintenanceRequest, on_delete=models.PROTECT, null=True, blank=True, related_name="repair"
    )
    description = models.TextField()
    provider_name = models.CharField(max_length=150, blank=True)
    provider_phone = models.CharField(max_length=32, blank=True)
    completed_on = models.DateField()
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")

    class Meta:
        ordering = ["-completed_on", "-created_at"]

    @property
    def cost(self):
        expense = getattr(self, "expense", None)
        return expense.amount if expense else 0
