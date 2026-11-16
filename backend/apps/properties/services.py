from django.conf import settings
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.core.exceptions import BusinessRuleError
from apps.notifications.services import notify, property_staff

from .models import Tenancy, TenantInvitation


def invitation_link(token: str) -> str:
    return f"{settings.FRONTEND_URL}/join/{token}"


def send_invitation_email(invitation: TenantInvitation, token: str):
    """Best effort: the landlord can always copy the link and share it by SMS or WhatsApp."""
    unit = invitation.unit
    try:
        send_mail(
            subject=f"Rental_Control: your invitation to {unit.property.name}",
            message=(
                f"Hello {invitation.full_name},\n\n"
                f"You have been invited to join {unit.property.name}, {unit.name} on Rental_Control.\n"
                f"Open this link to create your account (valid for {TenantInvitation.VALID_DAYS} days):\n\n"
                f"{invitation_link(token)}\n"
            ),
            from_email=None,
            recipient_list=[invitation.email],
            fail_silently=True,
        )
    except Exception:  # pragma: no cover - mail must never block the workflow
        pass


@transaction.atomic
def accept_invitation(invitation: TenantInvitation, user) -> Tenancy:
    invitation = TenantInvitation.objects.select_for_update().get(pk=invitation.pk)
    if invitation.status != TenantInvitation.Status.PENDING:
        raise BusinessRuleError("This invitation can no longer be used.", code=f"invitation_{invitation.status}")
    unit = invitation.unit
    if unit.tenancies.filter(moved_out_on__isnull=True).exists():
        raise BusinessRuleError("Someone already lives in this unit. Ask your landlord for help.", code="unit_occupied")
    try:
        with transaction.atomic():
            tenancy = Tenancy.objects.create(
                unit=unit,
                tenant=user,
                start_date=invitation.start_date,
                lease_end_date=invitation.lease_end_date,
                monthly_rent=invitation.monthly_rent,
                rent_due_day=invitation.rent_due_day,
                created_by=invitation.created_by,
            )
    except IntegrityError:
        raise BusinessRuleError("Someone already lives in this unit. Ask your landlord for help.", code="unit_occupied")
    invitation.accepted_at = timezone.now()
    invitation.accepted_by = user
    invitation.tenancy = tenancy
    invitation.save(update_fields=["accepted_at", "accepted_by", "tenancy", "updated_at"])
    notify(
        property_staff(unit.property),
        "tenant_joined",
        link=f"/landlord/units/{unit.pk}",
        tenant=user.full_name,
        unit=unit.name,
        property=unit.property.name,
    )
    notify([user], "tenancy_started", link="/tenant/home", unit=unit.name, property=unit.property.name)
    return tenancy
