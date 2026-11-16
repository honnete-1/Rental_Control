from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.db import transaction
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.middleware.csrf import get_token
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, serializers, status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.exceptions import AuthenticationFailed, NotAuthenticated, PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.core.audit import audit
from apps.core.security import enforce_csrf
from apps.core.throttles import AuthThrottle
from apps.properties.models import TenantInvitation
from apps.properties.services import accept_invitation

from .models import User
from .serializers import (
    ChangePasswordSerializer,
    InvitationAcceptSerializer,
    LoginSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    SignupSerializer,
    UserSerializer,
)


def _me(request, user, http_status=status.HTTP_200_OK):
    return Response(UserSerializer(user, context={"request": request}).data, status=http_status)


@extend_schema(responses={204: None})
@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def csrf(request):
    """Sets the CSRF cookie. The web app calls this once before sending forms."""
    get_token(request._request)
    return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(request=SignupSerializer, responses={201: UserSerializer})
@api_view(["POST"])
@permission_classes([permissions.AllowAny])
@throttle_classes([AuthThrottle])
def signup(request):
    enforce_csrf(request)
    serializer = SignupSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()
    login(request._request, user, backend="django.contrib.auth.backends.ModelBackend")
    audit(request, "account.signup", user, role=user.role)
    return _me(request, user, status.HTTP_201_CREATED)


@extend_schema(request=LoginSerializer, responses={200: UserSerializer})
@api_view(["POST"])
@permission_classes([permissions.AllowAny])
@throttle_classes([AuthThrottle])
def login_view(request):
    enforce_csrf(request)
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = authenticate(
        request._request,
        email=serializer.validated_data["email"].strip().lower(),
        password=serializer.validated_data["password"],
    )
    if user is None:
        raise AuthenticationFailed("The email or password is not correct.", code="invalid_credentials")
    login(request._request, user)
    return _me(request, user)


@extend_schema(request=None, responses={204: None})
@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def logout_view(request):
    logout(request._request)
    return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(methods=["GET"], responses=UserSerializer)
@extend_schema(methods=["PATCH"], request=UserSerializer, responses=UserSerializer)
@api_view(["GET", "PATCH"])
def me(request):
    if request.method == "PATCH":
        serializer = UserSerializer(request.user, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
    return _me(request, request.user)


@extend_schema(request=ChangePasswordSerializer, responses={204: None})
@api_view(["POST"])
@throttle_classes([AuthThrottle])
def change_password(request):
    serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    request.user.set_password(serializer.validated_data["new_password"])
    request.user.save(update_fields=["password"])
    login(request._request, request.user, backend="django.contrib.auth.backends.ModelBackend")
    audit(request, "account.password_changed", request.user)
    return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(request=PasswordResetRequestSerializer, responses={202: None})
@api_view(["POST"])
@permission_classes([permissions.AllowAny])
@throttle_classes([AuthThrottle])
def password_reset(request):
    enforce_csrf(request)
    """Always answers the same way, so it cannot be used to discover which emails have accounts."""
    serializer = PasswordResetRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = User.objects.filter(email__iexact=serializer.validated_data["email"], is_active=True).first()
    if user:
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        link = f"{settings.FRONTEND_URL}/reset-password/{uid}/{token}"
        send_mail(
            subject="Rental_Control: reset your password",
            message=f"Hello {user.full_name},\n\nOpen this link to choose a new password:\n\n{link}\n\n"
            "If you did not ask for this, you can ignore this email.",
            from_email=None,
            recipient_list=[user.email],
            fail_silently=True,
        )
    return Response(status=status.HTTP_202_ACCEPTED)


@extend_schema(request=PasswordResetConfirmSerializer, responses={204: None})
@api_view(["POST"])
@permission_classes([permissions.AllowAny])
@throttle_classes([AuthThrottle])
def password_reset_confirm(request):
    enforce_csrf(request)
    serializer = PasswordResetConfirmSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    try:
        user = User.objects.get(pk=force_str(urlsafe_base64_decode(data["uid"])))
    except (User.DoesNotExist, ValueError, TypeError, OverflowError):
        user = None
    if user is None or not default_token_generator.check_token(user, data["token"]):
        raise ValidationError({"token": [serializers.ErrorDetail("This reset link has expired or was already used.", code="invalid_reset_link")]})
    from django.contrib.auth import password_validation

    try:
        password_validation.validate_password(data["new_password"], user)
    except Exception as exc:
        raise ValidationError({"new_password": [serializers.ErrorDetail(m, code="weak_password") for m in exc.messages]})
    user.set_password(data["new_password"])
    user.save(update_fields=["password"])
    audit(request, "account.password_reset", user)
    return Response(status=status.HTTP_204_NO_CONTENT)


def _invitation_or_404(token):
    from rest_framework.exceptions import NotFound

    invitation = TenantInvitation.find_by_token(token)
    if invitation is None:
        raise NotFound("This invitation link is not valid.", code="invitation_not_found")
    return invitation


@extend_schema(responses={200: dict})
@api_view(["GET"])
@permission_classes([permissions.AllowAny])
@throttle_classes([AuthThrottle])
def invitation_detail(request, token):
    """Public information shown on the 'join your home' page. Reveals only what the invitee needs."""
    invitation = _invitation_or_404(token)
    unit = invitation.unit
    return Response(
        {
            "status": invitation.status,
            "full_name": invitation.full_name,
            "email": invitation.email,
            "property_name": unit.property.name,
            "unit_name": unit.name,
            "landlord_name": unit.property.owner.full_name,
            "start_date": invitation.start_date,
            "account_exists": User.objects.filter(email__iexact=invitation.email).exists(),
        }
    )


@extend_schema(request=InvitationAcceptSerializer, responses={200: UserSerializer})
@api_view(["POST"])
@permission_classes([permissions.AllowAny])
@throttle_classes([AuthThrottle])
def invitation_accept(request, token):
    enforce_csrf(request)
    invitation = _invitation_or_404(token)
    serializer = InvitationAcceptSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    if invitation.status != TenantInvitation.Status.PENDING:
        from apps.core.exceptions import BusinessRuleError

        raise BusinessRuleError("This invitation can no longer be used.", code=f"invitation_{invitation.status}")
    existing = User.objects.filter(email__iexact=invitation.email).first()
    with transaction.atomic():
        if existing:
            # An existing account must be signed in as the invited person.
            if not request.user.is_authenticated:
                raise NotAuthenticated("Please sign in with the invited email address first.", code="sign_in_required")
            if request.user.pk != existing.pk:
                raise PermissionDenied("This invitation is for a different email address.", code="wrong_account")
            if existing.role != User.Role.TENANT:
                raise PermissionDenied("This invitation can only be accepted by a tenant account.", code="not_tenant_account")
            user = existing
        else:
            errors = {}
            if not data.get("password"):
                errors["password"] = [serializers.ErrorDetail("Please choose a password.", code="required")]
            if errors:
                raise ValidationError(errors)
            from django.contrib.auth import password_validation

            candidate = User(email=invitation.email, full_name=data.get("full_name") or invitation.full_name)
            try:
                password_validation.validate_password(data["password"], candidate)
            except Exception as exc:
                raise ValidationError({"password": [serializers.ErrorDetail(m, code="weak_password") for m in exc.messages]})
            user = User.objects.create_user(
                email=invitation.email,
                password=data["password"],
                full_name=data.get("full_name") or invitation.full_name,
                phone=data.get("phone") or invitation.phone,
                language=data.get("language") or User.Language.ENGLISH,
                role=User.Role.TENANT,
            )
        accept_invitation(invitation, user)
    if not request.user.is_authenticated:
        login(request._request, user, backend="django.contrib.auth.backends.ModelBackend")
    audit(request, "invitation.accepted", invitation, property_id=invitation.unit.property_id)
    return _me(request, user)
