"""Loads fictional, development-only sample data (Rwandan rental properties).

    python manage.py seed_demo          # create demo data
    python manage.py seed_demo --reset  # delete previous demo data first

Refuses to run unless ALLOW_DEMO_SEED is true (default only when DJANGO_DEBUG is true).
All demo records are marked is_demo=True and use @demo.rentalcontrol.test email addresses.
"""

import io
import os
from datetime import timedelta

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from PIL import Image, ImageDraw

from apps.accounts.models import User
from apps.finance.models import Expense, RentPayment
from apps.finance.services import ensure_rent_charges
from apps.inspections.models import Inspection, InspectionItem, InspectionPhoto
from apps.inspections.serializers import create_room_items
from apps.maintenance.models import MaintenancePhoto, MaintenanceRequest, MaintenanceUpdate
from apps.maintenance.services import change_status, record_repair
from apps.notifications.services import notify, property_staff
from apps.properties.models import Property, PropertyManagerAssignment, Tenancy, Unit

DEMO_DOMAIN = "demo.rentalcontrol.test"


def placeholder_photo(label, color):
    """A simple generated picture so the demo works offline (not a real photograph)."""
    img = Image.new("RGB", (960, 640), color)
    draw = ImageDraw.Draw(img)
    draw.rectangle([40, 40, 920, 600], outline=(255, 255, 255), width=6)
    draw.text((80, 80), f"DEMO PHOTO\n{label}", fill=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=80)
    return ContentFile(buf.getvalue(), name=f"{label}.jpg")


class Command(BaseCommand):
    help = "Create fictional development-only demo data."

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Delete existing demo data first.")

    def handle(self, *args, **options):
        if not settings.ALLOW_DEMO_SEED:
            raise CommandError("Demo data is disabled. Set ALLOW_DEMO_SEED=true (development only).")
        password = os.environ.get("DEMO_PASSWORD", "")
        if len(password) < 8:
            raise CommandError("Set DEMO_PASSWORD (at least 8 characters) in backend/.env before seeding.")
        if options["reset"]:
            self.reset()
        if User.objects.filter(email=f"landlord@{DEMO_DOMAIN}").exists():
            self.stdout.write(self.style.WARNING("Demo data already exists. Use --reset to recreate it."))
            return
        with transaction.atomic():
            self.create(password)
        self.stdout.write(self.style.SUCCESS("Demo data created. Sign in with:"))
        for role in ("landlord", "tenant", "tenant2", "manager"):
            self.stdout.write(f"  {role}@{DEMO_DOMAIN}  (password: DEMO_PASSWORD from backend/.env)")

    def reset(self):
        demo_users = User.objects.filter(is_demo=True)
        props = Property.objects.filter(is_demo=True)
        Expense.objects.filter(property__in=props).delete()
        RentPayment.objects.filter(tenancy__unit__property__in=props).delete()
        from apps.maintenance.models import Repair

        Repair.objects.filter(unit__property__in=props).delete()
        MaintenanceRequest.objects.filter(unit__property__in=props).delete()
        Inspection.objects.filter(unit__property__in=props).delete()
        Tenancy.objects.filter(unit__property__in=props).delete()
        props.delete()
        demo_users.delete()
        self.stdout.write("Previous demo data deleted.")

    def create(self, password):
        today = timezone.localdate()
        landlord = User.objects.create_user(
            email=f"landlord@{DEMO_DOMAIN}", password=password, full_name="Jean-Baptiste Mugenzi (demo)",
            phone="+250 788 000 001", role=User.Role.LANDLORD, onboarding_completed=True, is_demo=True,
        )
        manager = User.objects.create_user(
            email=f"manager@{DEMO_DOMAIN}", password=password, full_name="Aline Uwase (demo)",
            phone="+250 788 000 002", role=User.Role.MANAGER, onboarding_completed=True, is_demo=True,
        )
        tenant = User.objects.create_user(
            email=f"tenant@{DEMO_DOMAIN}", password=password, full_name="Eric Niyonzima (demo)",
            phone="+250 788 000 003", role=User.Role.TENANT, language="rw", onboarding_completed=True, is_demo=True,
        )
        tenant2 = User.objects.create_user(
            email=f"tenant2@{DEMO_DOMAIN}", password=password, full_name="Claudine Mukamana (demo)",
            phone="+250 788 000 004", role=User.Role.TENANT, language="fr", onboarding_completed=True, is_demo=True,
        )

        kib = Property.objects.create(
            owner=landlord, name="Kibagabaga Residence", property_type=Property.PropertyType.APARTMENT_BUILDING,
            address="KG 15 Ave", district="Gasabo", city="Kigali", is_demo=True,
            description="Two-storey building with four apartments and a shared parking.",
        )
        kib.photo.save("kibagabaga.jpg", placeholder_photo("Kibagabaga Residence", (13, 148, 136)), save=True)
        rem = Property.objects.create(
            owner=landlord, name="Remera Family House", property_type=Property.PropertyType.HOUSE,
            address="KK 3 Rd", district="Gasabo", city="Kigali", is_demo=True,
        )
        rem.photo.save("remera.jpg", placeholder_photo("Remera Family House", (20, 43, 69)), save=True)
        kic = Property.objects.create(
            owner=landlord, name="Kicukiro Shops", property_type=Property.PropertyType.COMMERCIAL,
            address="KK 500 St", district="Kicukiro", city="Kigali", is_demo=True,
        )
        PropertyManagerAssignment.objects.create(property=kib, manager=manager, can_view_finances=False, assigned_by=landlord)

        a1 = Unit.objects.create(property=kib, name="A1", unit_type="apartment", bedrooms=2, bathrooms=1, monthly_rent=250_000)
        a2 = Unit.objects.create(property=kib, name="A2", unit_type="apartment", bedrooms=2, bathrooms=1, monthly_rent=250_000)
        Unit.objects.create(property=kib, name="B1", unit_type="apartment", bedrooms=3, bathrooms=2, monthly_rent=350_000)
        house = Unit.objects.create(property=rem, name="Main house", unit_type="house", bedrooms=4, bathrooms=2, monthly_rent=600_000)
        Unit.objects.create(property=kic, name="Shop 1", unit_type="shop", monthly_rent=180_000)

        start = (today.replace(day=1) - timedelta(days=95)).replace(day=1)
        t1 = Tenancy.objects.create(unit=a1, tenant=tenant, start_date=start, monthly_rent=250_000, rent_due_day=5, created_by=landlord)
        t2 = Tenancy.objects.create(unit=house, tenant=tenant2, start_date=start, monthly_rent=600_000, rent_due_day=10, created_by=landlord)

        # Move-in inspection for A1 with photos.
        insp = Inspection.objects.create(
            unit=a1, tenancy=t1, inspection_type="move_in", inspection_date=start, inspector_name=landlord.full_name,
            created_by=landlord, summary="Apartment clean and ready. Small crack above the bedroom window.",
        )
        create_room_items(insp, [{"name": "Living room"}, {"name": "Kitchen", "has_water": True},
                                 {"name": "Bedroom 1"}, {"name": "Bathroom", "has_water": True}])
        insp.items.update(condition="good")
        InspectionItem.objects.filter(inspection=insp, area="Bedroom 1", element="walls_ceiling").update(
            condition="needs_attention", notes="Small crack above the window")
        for area, color in (("Kitchen", (180, 120, 60)), ("Bedroom 1", (90, 110, 140))):
            InspectionPhoto.objects.create(inspection=insp, area=area, image=placeholder_photo(f"{area} move-in", color),
                                           caption=f"{area} at move-in", uploaded_by=landlord)
        insp.status = "completed"
        insp.completed_at = timezone.now()
        insp.save()

        periodic = Inspection.objects.create(
            unit=a1, tenancy=t1, inspection_type="periodic", inspection_date=today - timedelta(days=10),
            inspector_name=manager.full_name, created_by=manager, summary="Regular check. Kitchen sink was leaking.",
        )
        create_room_items(periodic, [{"name": "Kitchen", "has_water": True}, {"name": "Bedroom 1"}])
        periodic.items.update(condition="good")
        InspectionItem.objects.filter(inspection=periodic, area="Kitchen", element="plumbing").update(
            condition="damaged", notes="Water leaking under the sink")
        InspectionPhoto.objects.create(inspection=periodic, area="Kitchen", image=placeholder_photo("Kitchen regular check", (150, 80, 50)),
                                       caption="Kitchen sink cabinet", uploaded_by=manager)
        periodic.status = "completed"
        periodic.completed_at = timezone.now()
        periodic.save()

        # Resolved request: kitchen sink leakage, repaired for RWF 45,000.
        leak = MaintenanceRequest.objects.create(
            unit=a1, tenancy=t1, reported_by=tenant, category="plumbing", location_in_home="Kitchen",
            description="Water is leaking under the kitchen sink. The cupboard floor is wet.", priority="urgent",
        )
        MaintenanceUpdate.objects.create(request=leak, author=tenant, kind="reported")
        MaintenancePhoto.objects.create(request=leak, image=placeholder_photo("Kitchen sink leak", (60, 90, 160)), uploaded_by=tenant)
        change_status(leak, "under_review", landlord, "We will send a plumber tomorrow morning.")
        change_status(leak, "approved", landlord)
        leak.provider_name = "Gakwaya Plumbing (demo)"
        leak.provider_phone = "+250 788 000 010"
        leak.save()
        change_status(leak, "in_progress", landlord)
        record_repair(leak, landlord, {
            "description": "Replaced the sink pipe and seal.", "provider_name": "Gakwaya Plumbing (demo)",
            "completed_on": today - timedelta(days=7), "cost": 45_000, "mark_resolved": True,
        })

        # Open requests.
        light = MaintenanceRequest.objects.create(
            unit=a1, tenancy=t1, reported_by=tenant, category="electricity", location_in_home="Bedroom 1",
            description="The bedroom light does not switch on.", priority="normal",
        )
        MaintenanceUpdate.objects.create(request=light, author=tenant, kind="reported")
        notify(property_staff(kib), "request_created", link=f"/landlord/maintenance/{light.pk}", reference=light.reference,
               unit=a1.name, property=kib.name, category="electricity", priority="normal")
        roof = MaintenanceRequest.objects.create(
            unit=house, tenancy=t2, reported_by=tenant2, category="walls_ceiling", location_in_home="Living room",
            description="Rain water comes through the ceiling in the living room.", priority="urgent",
        )
        MaintenanceUpdate.objects.create(request=roof, author=tenant2, kind="reported")
        notify(property_staff(rem), "request_created", link=f"/landlord/maintenance/{roof.pk}", reference=roof.reference,
               unit=house.name, property=rem.name, category="walls_ceiling", priority="urgent")

        # Rent: tenant 1 is up to date; tenant 2 missed the latest month.
        for tenancy in (t1, t2):
            ensure_rent_charges(tenancy, today)
        for charge in t1.rent_charges.filter(due_date__lte=today):
            RentPayment.objects.create(tenancy=t1, amount=charge.amount_due, paid_on=charge.due_date, method="mobile_money",
                                       reference=f"MM{charge.period_start:%Y%m}", recorded_by=landlord)
        for charge in list(t2.rent_charges.filter(due_date__lte=today).order_by("period_start"))[:-1]:
            RentPayment.objects.create(tenancy=t2, amount=charge.amount_due, paid_on=charge.due_date, method="bank",
                                       recorded_by=landlord)

        Expense.objects.create(property=kib, category="security", amount=60_000, spent_on=today.replace(day=1),
                               description="Night guard salary", created_by=landlord)
        Expense.objects.create(property=rem, unit=house, category="utilities", amount=18_500, spent_on=today.replace(day=1),
                               description="Water bill (WASAC)", created_by=landlord)
        Expense.objects.create(property=kib, category="cleaning", amount=25_000,
                               spent_on=today.replace(day=1) - timedelta(days=20), description="Cleaning of shared areas",
                               created_by=landlord)
