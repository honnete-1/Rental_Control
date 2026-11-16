from .models import AuditLog


def client_ip(request):
    if request is None:
        return None
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip() or None
    return request.META.get("REMOTE_ADDR") or None


def audit(request, action, obj, property_id=None, **details):
    actor = getattr(request, "user", None)
    if actor is not None and not actor.is_authenticated:
        actor = None
    return AuditLog.objects.create(
        actor=actor,
        action=action,
        object_type=obj.__class__.__name__,
        object_id=str(obj.pk),
        property_id=property_id,
        details=details,
        ip_address=client_ip(request),
    )
