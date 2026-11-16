from django.conf import settings
from django.db import models


class Notification(models.Model):
    """In-app notification. Text is built on the frontend from ``kind`` + ``params``,
    so it always appears in the reader's chosen language."""

    class Kind(models.TextChoices):
        REQUEST_CREATED = "request_created"
        REQUEST_STATUS = "request_status"
        REQUEST_NOTE = "request_note"
        REPAIR_COMPLETED = "repair_completed"
        TENANT_JOINED = "tenant_joined"
        TENANCY_STARTED = "tenancy_started"
        INSPECTION_SHARED = "inspection_shared"
        PAYMENT_RECORDED = "payment_recorded"
        MANAGER_ASSIGNED = "manager_assigned"

    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    kind = models.CharField(max_length=32, choices=Kind.choices)
    params = models.JSONField(default=dict, blank=True)
    link = models.CharField(max_length=255, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["recipient", "read_at"])]
