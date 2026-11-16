from rest_framework.permissions import BasePermission

from apps.accounts.models import User


class IsPropertyStaff(BasePermission):
    """Landlords and property managers."""

    message = "This page is only for landlords and property managers."

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in (User.Role.LANDLORD, User.Role.MANAGER)


class IsLandlord(BasePermission):
    message = "Only property owners can do this."

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == User.Role.LANDLORD


class IsTenant(BasePermission):
    message = "This page is only for tenants."

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == User.Role.TENANT
