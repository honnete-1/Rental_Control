from datetime import timedelta

from django.utils import timezone

from .models import Notification


def notify(recipients, kind, link="", dedupe_minutes=0, **params):
    """Creates in-app notifications. Never raises: notifications must not block a workflow.

    ``dedupe_minutes`` skips a notification identical to an unread one sent recently,
    to avoid repetitive alerts.
    """
    created = []
    seen = set()
    for user in recipients:
        if user is None or user.pk in seen or not user.is_active:
            continue
        seen.add(user.pk)
        if dedupe_minutes:
            since = timezone.now() - timedelta(minutes=dedupe_minutes)
            if Notification.objects.filter(
                recipient=user, kind=kind, link=link, read_at__isnull=True, created_at__gte=since
            ).exists():
                continue
        created.append(Notification(recipient=user, kind=kind, link=link, params=params))
    if created:
        Notification.objects.bulk_create(created)
    return created


def property_staff(property_obj):
    """The owner and active managers of a property."""
    from django.contrib.auth import get_user_model

    User = get_user_model()
    manager_ids = property_obj.manager_assignments.filter(is_active=True).values_list("manager_id", flat=True)
    return list(User.objects.filter(pk__in=[property_obj.owner_id, *manager_ids]))
