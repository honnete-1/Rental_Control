import builtins
import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone

from apps.core.models import TimeStampedModel
from apps.core.uploads import property_photo_path, validate_image


class Property(TimeStampedModel):
    class PropertyType(models.TextChoices):
        HOUSE = "house", "House"
        APARTMENT_BUILDING = "apartment_building", "Apartment building"
        COMPOUND = "compound", "Compound with several houses"
        COMMERCIAL = "commercial", "Shop or office"
        OTHER = "other", "Other"

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="owned_properties")
    name = models.CharField(max_length=120)
    property_type = models.CharField(max_length=32, choices=PropertyType.choices, default=PropertyType.HOUSE)
    address = models.CharField(max_length=255, blank=True)
    district = models.CharField(max_length=80, blank=True)
    city = models.CharField(max_length=80, default="Kigali")
    country = models.CharField(max_length=2, default="RW")
    description = models.TextField(blank=True)
    notes = models.TextField(blank=True, help_text="Private notes for the owner and managers.")
    photo = models.ImageField(upload_to=property_photo_path, blank=True, validators=[validate_image])
    is_demo = models.BooleanField(default=False)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "properties"
        indexes = [models.Index(fields=["owner", "name"])]

    def __str__(self):
        return self.name


class PropertyManagerAssignment(TimeStampedModel):
    """Grants a property manager access to one property owned by someone else."""

    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name="manager_assignments")
    manager = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="manager_assignments")
    can_view_finances = models.BooleanField(default=False)
    assigned_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["property", "manager"], name="unique_manager_per_property")]


class Unit(TimeStampedModel):
    class UnitType(models.TextChoices):
        APARTMENT = "apartment", "Apartment"
        HOUSE = "house", "House"
        ROOM = "room", "Room"
        STUDIO = "studio", "Studio"
        SHOP = "shop", "Shop"
        OFFICE = "office", "Office"
        OTHER = "other", "Other"

    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name="units")
    name = models.CharField(max_length=60)
    unit_type = models.CharField(max_length=20, choices=UnitType.choices, default=UnitType.APARTMENT)
    bedrooms = models.PositiveSmallIntegerField(null=True, blank=True, validators=[MaxValueValidator(50)])
    bathrooms = models.PositiveSmallIntegerField(null=True, blank=True, validators=[MaxValueValidator(50)])
    # Money is stored as whole Rwandan francs (RWF has no minor unit in practice).
    monthly_rent = models.PositiveBigIntegerField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["property__name", "name"]
        constraints = [models.UniqueConstraint(fields=["property", "name"], name="unique_unit_name_per_property")]

    def __str__(self):
        return f"{self.property.name} — {self.name}"

    @builtins.property
    def active_tenancy(self):
        return self.tenancies.filter(moved_out_on__isnull=True).select_related("tenant").first()


class Tenancy(TimeStampedModel):
    """A tenant living in a unit for a period of time (also holds the simple lease terms)."""

    unit = models.ForeignKey(Unit, on_delete=models.PROTECT, related_name="tenancies")
    tenant = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="tenancies")
    start_date = models.DateField()
    lease_end_date = models.DateField(null=True, blank=True)
    moved_out_on = models.DateField(null=True, blank=True)
    monthly_rent = models.PositiveBigIntegerField(default=0)
    rent_due_day = models.PositiveSmallIntegerField(
        default=5, validators=[MinValueValidator(1), MaxValueValidator(28)]
    )
    share_payments_with_tenant = models.BooleanField(default=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")

    class Meta:
        ordering = ["-start_date"]
        verbose_name_plural = "tenancies"
        constraints = [
            models.UniqueConstraint(
                fields=["unit"], condition=Q(moved_out_on__isnull=True), name="one_active_tenancy_per_unit"
            )
        ]

    def __str__(self):
        return f"{self.tenant} @ {self.unit}"

    @property
    def is_active(self):
        return self.moved_out_on is None


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class TenantInvitation(TimeStampedModel):
    """A secure, single-use invitation for a tenant to join one specific unit."""

    VALID_DAYS = 14

    unit = models.ForeignKey(Unit, on_delete=models.CASCADE, related_name="invitations")
    full_name = models.CharField(max_length=150)
    email = models.EmailField()
    phone = models.CharField(max_length=32, blank=True)
    start_date = models.DateField()
    lease_end_date = models.DateField(null=True, blank=True)
    monthly_rent = models.PositiveBigIntegerField(default=0)
    rent_due_day = models.PositiveSmallIntegerField(default=5, validators=[MinValueValidator(1), MaxValueValidator(28)])
    token_hash = models.CharField(max_length=64, unique=True, editable=False)
    expires_at = models.DateTimeField()
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")
    accepted_at = models.DateTimeField(null=True, blank=True)
    accepted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    tenancy = models.OneToOneField(Tenancy, on_delete=models.SET_NULL, null=True, blank=True, related_name="invitation")
    cancelled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    class Status(models.TextChoices):
        PENDING = "pending"
        ACCEPTED = "accepted"
        EXPIRED = "expired"
        CANCELLED = "cancelled"

    @property
    def status(self):
        if self.cancelled_at:
            return self.Status.CANCELLED
        if self.accepted_at:
            return self.Status.ACCEPTED
        if self.expires_at <= timezone.now():
            return self.Status.EXPIRED
        return self.Status.PENDING

    def issue_token(self) -> str:
        """Generates a new secret token. Only the hash is stored; the token is shown once."""
        token = secrets.token_urlsafe(32)
        self.token_hash = _hash_token(token)
        self.expires_at = timezone.now() + timedelta(days=self.VALID_DAYS)
        return token

    @classmethod
    def find_by_token(cls, token: str):
        if not token or len(token) > 128:
            return None
        return cls.objects.select_related("unit__property__owner").filter(token_hash=_hash_token(token)).first()
