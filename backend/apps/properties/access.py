"""Object-level access rules. Every queryset in the API is built from these helpers,
so a user can never reach a record by guessing an ID in the URL."""

from django.db.models import Q

from apps.accounts.models import User

from .models import Property, Tenancy, Unit


def managed_properties(user):
    """Properties the user may manage: those they own, plus those assigned to them as manager."""
    if not user.is_authenticated or user.role in (User.Role.TENANT,):
        return Property.objects.none()
    return Property.objects.filter(
        Q(owner=user) | Q(manager_assignments__manager=user, manager_assignments__is_active=True)
    ).distinct()


def finance_properties(user):
    """Properties whose money records the user may see (owner, or manager with finance access)."""
    if not user.is_authenticated or user.role == User.Role.TENANT:
        return Property.objects.none()
    return Property.objects.filter(
        Q(owner=user)
        | Q(
            manager_assignments__manager=user,
            manager_assignments__is_active=True,
            manager_assignments__can_view_finances=True,
        )
    ).distinct()


def managed_units(user):
    return Unit.objects.filter(property__in=managed_properties(user))


def active_tenancies(user):
    if not user.is_authenticated:
        return Tenancy.objects.none()
    return Tenancy.objects.filter(tenant=user, moved_out_on__isnull=True)


def user_tenancies(user):
    """All tenancies of this tenant, including past ones (their own history only)."""
    if not user.is_authenticated:
        return Tenancy.objects.none()
    return Tenancy.objects.filter(tenant=user)


def is_manager_of(user, property_id) -> bool:
    return managed_properties(user).filter(pk=property_id).exists()


def is_owner_of(user, property_obj) -> bool:
    return user.is_authenticated and property_obj.owner_id == user.pk
