from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models

from apps.core.models import TimeStampedModel
from apps.core.uploads import receipt_path, validate_receipt


class Expense(TimeStampedModel):
    """Money spent on a property. All amounts are whole Rwandan francs (integers, never floats)."""

    class Category(models.TextChoices):
        REPAIR = "repair", "Repair and maintenance"
        UTILITIES = "utilities", "Water and electricity"
        CLEANING = "cleaning", "Cleaning"
        SECURITY = "security", "Security guard"
        INSURANCE = "insurance", "Insurance"
        TAXES_FEES = "taxes_fees", "Taxes and fees"
        MANAGEMENT = "management", "Management fees"
        OTHER = "other", "Other"

    MAINTENANCE_CATEGORIES = (Category.REPAIR,)

    property = models.ForeignKey("properties.Property", on_delete=models.PROTECT, related_name="expenses")
    unit = models.ForeignKey("properties.Unit", on_delete=models.PROTECT, null=True, blank=True, related_name="expenses")
    category = models.CharField(max_length=20, choices=Category.choices, db_index=True)
    amount = models.PositiveBigIntegerField(validators=[MinValueValidator(1)])
    currency = models.CharField(max_length=3, default="RWF")
    spent_on = models.DateField(db_index=True)
    description = models.CharField(max_length=255)
    maintenance_request = models.ForeignKey(
        "maintenance.MaintenanceRequest", on_delete=models.SET_NULL, null=True, blank=True, related_name="expenses"
    )
    # When set, this expense IS the cost of that repair (one expense per repair, so it is counted once).
    repair = models.OneToOneField(
        "maintenance.Repair", on_delete=models.CASCADE, null=True, blank=True, related_name="expense"
    )
    receipt = models.FileField(upload_to=receipt_path, blank=True, validators=[validate_receipt])
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")

    class Meta:
        ordering = ["-spent_on", "-created_at"]
        indexes = [models.Index(fields=["property", "spent_on"])]

    def __str__(self):
        return f"{self.description} — {self.amount} {self.currency}"


class RentCharge(models.Model):
    """Rent due for one month of a tenancy. Generated automatically from the tenancy terms."""

    tenancy = models.ForeignKey("properties.Tenancy", on_delete=models.CASCADE, related_name="rent_charges")
    period_start = models.DateField(help_text="First day of the month this rent covers")
    due_date = models.DateField(db_index=True)
    amount_due = models.PositiveBigIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["period_start"]
        constraints = [models.UniqueConstraint(fields=["tenancy", "period_start"], name="one_charge_per_month")]


class RentPayment(TimeStampedModel):
    """Rent money received, recorded by hand. No payment is processed by Rental_Control."""

    class Method(models.TextChoices):
        CASH = "cash", "Cash"
        MOBILE_MONEY = "mobile_money", "Mobile money"
        BANK = "bank", "Bank transfer"
        OTHER = "other", "Other"

    tenancy = models.ForeignKey("properties.Tenancy", on_delete=models.PROTECT, related_name="rent_payments")
    amount = models.PositiveBigIntegerField(validators=[MinValueValidator(1)])
    paid_on = models.DateField(db_index=True)
    method = models.CharField(max_length=16, choices=Method.choices, default=Method.CASH)
    reference = models.CharField(max_length=80, blank=True, help_text="Receipt or transaction number")
    notes = models.CharField(max_length=255, blank=True)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")

    class Meta:
        ordering = ["-paid_on", "-created_at"]
