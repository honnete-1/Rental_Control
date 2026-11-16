from django.contrib import admin

from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    """Read-only. Audit entries can never be changed."""

    list_display = ["created_at", "action", "actor", "object_type", "object_id"]
    list_filter = ["action"]
    search_fields = ["action", "object_id", "actor__email"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
