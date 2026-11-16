from rest_framework.authentication import CSRFCheck
from rest_framework.exceptions import PermissionDenied


def enforce_csrf(request):
    """Applies Django's CSRF check to views that also accept anonymous users
    (sign-in, sign-up, invitations). DRF only checks CSRF for signed-in sessions."""
    check = CSRFCheck(lambda r: None)
    check.process_request(request._request)
    reason = check.process_view(request._request, None, (), {})
    if reason:
        raise PermissionDenied("Your session expired. Please refresh the page and try again.", code="csrf_failed")
