import io
import tempfile
from datetime import date

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.properties.models import Property, Tenancy, Unit

PASSWORD = "Strong-test-pass-91"
MEDIA = tempfile.mkdtemp(prefix="rc-test-media-")


def image_file(name="photo.jpg", color=(200, 30, 30)):
    buf = io.BytesIO()
    Image.new("RGB", (40, 30), color).save(buf, format="JPEG")
    return SimpleUploadedFile(name, buf.getvalue(), content_type="image/jpeg")


@override_settings(MEDIA_ROOT=MEDIA)
class APITestCase(TestCase):
    def setUp(self):
        cache.clear()  # reset rate limits between tests

    @staticmethod
    def make_user(email, role=User.Role.LANDLORD, **extra):
        return User.objects.create_user(email=email, password=PASSWORD, full_name=extra.pop("full_name", email.split("@")[0]), role=role, **extra)

    @staticmethod
    def client_for(user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def make_property(self, owner, name="Kibagabaga Residence", units=("A1",)):
        prop = Property.objects.create(owner=owner, name=name, district="Gasabo")
        created = [Unit.objects.create(property=prop, name=u, monthly_rent=200_000) for u in units]
        return prop, created

    def make_tenancy(self, unit, tenant, start=date(2026, 1, 1), rent=200_000, due_day=5):
        return Tenancy.objects.create(unit=unit, tenant=tenant, start_date=start, monthly_rent=rent, rent_due_day=due_day)
