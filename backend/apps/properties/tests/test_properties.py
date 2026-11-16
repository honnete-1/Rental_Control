from datetime import date

from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AuditLog
from apps.core.tests.helpers import PASSWORD, APITestCase, image_file
from apps.notifications.models import Notification
from apps.properties.models import PropertyManagerAssignment, TenantInvitation


class PropertyAccessTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.owner = self.make_user("owner@example.com")
        self.other = self.make_user("other@example.com")
        self.prop, (self.a1, self.a2) = self.make_property(self.owner, units=("A1", "A2"))
        self.other_prop, (self.x1,) = self.make_property(self.other, name="Other house", units=("X1",))

    def test_landlord_creates_property_with_photo_and_units(self):
        client = self.client_for(self.owner)
        res = client.post("/api/properties/", {"name": "Remera House", "property_type": "house", "district": "Gasabo", "photo": image_file()}, format="multipart")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertTrue(res.data["photo"])
        pid = res.data["id"]
        for name in ("Main house", "Annex"):
            r = client.post("/api/units/", {"property": pid, "name": name, "bedrooms": 2, "monthly_rent": 300000}, format="json")
            self.assertEqual(r.status_code, 201, r.data)
        dup = client.post("/api/units/", {"property": pid, "name": "annex"}, format="json")
        self.assertEqual(dup.status_code, 400)
        detail = client.get(f"/api/properties/{pid}/").data
        self.assertEqual(detail["unit_count"], 2)
        self.assertEqual(detail["occupied_count"], 0)
        self.assertTrue(AuditLog.objects.filter(action="property.created").exists())

    def test_rejects_non_image_upload(self):
        client = self.client_for(self.owner)
        from django.core.files.uploadedfile import SimpleUploadedFile

        fake = SimpleUploadedFile("evil.jpg", b"<script>alert(1)</script>", content_type="image/jpeg")
        res = client.post("/api/properties/", {"name": "X", "photo": fake}, format="multipart")
        self.assertEqual(res.status_code, 400)
        self.assertIn("photo", res.data["fields"])

    def test_landlords_cannot_see_each_others_data(self):
        client = self.client_for(self.owner)
        names = [p["name"] for p in client.get("/api/properties/").data["results"]]
        self.assertEqual(names, ["Kibagabaga Residence"])
        self.assertEqual(client.get(f"/api/properties/{self.other_prop.pk}/").status_code, 404)
        self.assertEqual(client.patch(f"/api/properties/{self.other_prop.pk}/", {"name": "Hacked"}, format="json").status_code, 404)
        self.assertEqual(client.get(f"/api/units/{self.x1.pk}/").status_code, 404)
        self.assertEqual(client.get(f"/api/units/{self.x1.pk}/passport/").status_code, 404)
        res = client.post("/api/units/", {"property": self.other_prop.pk, "name": "Z9"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(client.post(f"/api/units/{self.x1.pk}/invite/", {}, format="json").status_code, 404)

    def test_tenant_cannot_use_landlord_endpoints(self):
        tenant = self.make_user("t@example.com", role=User.Role.TENANT)
        self.make_tenancy(self.a1, tenant)
        client = self.client_for(tenant)
        for url in ("/api/properties/", "/api/units/", "/api/tenancies/", "/api/expenses/", "/api/dashboard/landlord/", "/api/finance/summary/"):
            self.assertEqual(client.get(url).status_code, 403, url)
        self.assertEqual(client.post("/api/properties/", {"name": "Mine"}, format="json").status_code, 403)

    def test_cannot_delete_property_with_history(self):
        tenant = self.make_user("t@example.com", role=User.Role.TENANT)
        self.make_tenancy(self.a1, tenant)
        client = self.client_for(self.owner)
        res = client.delete(f"/api/properties/{self.prop.pk}/")
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data["code"], "property_has_history")
        empty, _ = self.make_property(self.owner, name="Empty", units=())
        self.assertEqual(client.delete(f"/api/properties/{empty.pk}/").status_code, 204)

    def test_manager_sees_only_assigned_properties(self):
        manager = self.make_user("m@example.com", role=User.Role.MANAGER)
        client = self.client_for(manager)
        self.assertEqual(client.get("/api/properties/").data["count"], 0)
        owner_client = self.client_for(self.owner)
        res = owner_client.post(f"/api/properties/{self.prop.pk}/managers/", {"email": "m@example.com"}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(client.get("/api/properties/").data["count"], 1)
        self.assertEqual(client.get(f"/api/properties/{self.other_prop.pk}/").status_code, 404)
        # Managers without finance permission cannot see money.
        self.assertEqual(client.get("/api/expenses/").data["count"], 0)
        self.assertEqual(client.post("/api/expenses/", {"property": self.prop.pk, "category": "other", "amount": 100, "spent_on": "2026-01-01", "description": "x"}, format="json").status_code, 400)
        # Managers cannot add new properties or manage other managers.
        self.assertEqual(client.post("/api/properties/", {"name": "New"}, format="json").status_code, 403)
        self.assertEqual(client.get(f"/api/properties/{self.prop.pk}/managers/").status_code, 403)
        assignment = PropertyManagerAssignment.objects.get()
        owner_client.delete(f"/api/properties/{self.prop.pk}/managers/{assignment.pk}/")
        self.assertEqual(client.get("/api/properties/").data["count"], 0)


class InvitationTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.owner = self.make_user("owner@example.com")
        self.prop, (self.a1,) = self.make_property(self.owner)

    def invite(self, email="new.tenant@example.com"):
        res = self.client_for(self.owner).post(f"/api/units/{self.a1.pk}/invite/", {
            "full_name": "Eric N", "email": email, "start_date": "2026-02-01", "rent_due_day": 5,
        }, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        return res.data["invite_link"].rsplit("/", 1)[1]

    def test_invitation_creates_tenant_account_and_tenancy(self):
        token = self.invite()
        self.assertEqual(TenantInvitation.objects.get().monthly_rent, 200_000)  # defaults to the unit rent
        anon = APIClient()
        info = anon.get(f"/api/auth/invitations/{token}/").data
        self.assertEqual(info["unit_name"], "A1")
        self.assertFalse(info["account_exists"])
        res = anon.post(f"/api/auth/invitations/{token}/accept/", {"password": PASSWORD, "language": "rw"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["role"], "tenant")
        self.assertTrue(res.data["has_home"])
        home = anon.get("/api/my-home/").data
        self.assertEqual(home["unit"]["name"], "A1")
        # Single use.
        again = APIClient().post(f"/api/auth/invitations/{token}/accept/", {"password": PASSWORD}, format="json")
        self.assertEqual(again.status_code, 409)
        self.assertTrue(Notification.objects.filter(recipient=self.owner, kind="tenant_joined").exists())
        unit = self.client_for(self.owner).get(f"/api/units/{self.a1.pk}/").data
        self.assertEqual(unit["occupancy"], "occupied")

    def test_invalid_token_and_cancelled_invitation(self):
        self.assertEqual(APIClient().get("/api/auth/invitations/not-a-real-token/").status_code, 404)
        token = self.invite()
        inv = TenantInvitation.objects.get()
        self.client_for(self.owner).post(f"/api/invitations/{inv.pk}/cancel/")
        res = APIClient().post(f"/api/auth/invitations/{token}/accept/", {"password": PASSWORD}, format="json")
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data["code"], "invitation_cancelled")

    def test_existing_account_must_sign_in_as_invited_person(self):
        existing = self.make_user("t@example.com", role=User.Role.TENANT)
        intruder = self.make_user("intruder@example.com", role=User.Role.TENANT)
        token = self.invite("t@example.com")
        self.assertEqual(APIClient().post(f"/api/auth/invitations/{token}/accept/", {}, format="json").status_code, 401)
        self.assertEqual(self.client_for(intruder).post(f"/api/auth/invitations/{token}/accept/", {}, format="json").status_code, 403)
        self.assertEqual(self.client_for(existing).post(f"/api/auth/invitations/{token}/accept/", {}, format="json").status_code, 200)

    def test_cannot_invite_into_occupied_unit_or_with_landlord_email(self):
        res = self.client_for(self.owner).post(f"/api/units/{self.a1.pk}/invite/", {
            "full_name": "X", "email": "owner@example.com", "start_date": "2026-02-01"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.make_tenancy(self.a1, self.make_user("t@example.com", role=User.Role.TENANT))
        res = self.client_for(self.owner).post(f"/api/units/{self.a1.pk}/invite/", {
            "full_name": "X", "email": "y@example.com", "start_date": "2026-02-01"}, format="json")
        self.assertEqual(res.status_code, 409)

    def test_move_out_keeps_history_but_removes_tenant_access(self):
        tenant = self.make_user("t@example.com", role=User.Role.TENANT)
        self.make_tenancy(self.a1, tenant, start=date(2026, 1, 1))
        tclient = self.client_for(tenant)
        res = tclient.post("/api/maintenance/", {"category": "plumbing", "description": "Leaking tap in kitchen"}, format="json")
        self.assertEqual(res.status_code, 201)
        req_id = res.data["id"]
        self.client_for(self.owner).post(f"/api/units/{self.a1.pk}/move-out/", {"moved_out_on": "2026-06-30"}, format="json")
        # New tenant must not see the previous tenant's request.
        new_tenant = self.make_user("t2@example.com", role=User.Role.TENANT)
        self.make_tenancy(self.a1, new_tenant, start=date(2026, 7, 1))
        nclient = self.client_for(new_tenant)
        self.assertEqual(nclient.get("/api/maintenance/").data["count"], 0)
        self.assertEqual(nclient.get(f"/api/maintenance/{req_id}/").status_code, 404)
        # The landlord keeps the full history.
        passport = self.client_for(self.owner).get(f"/api/units/{self.a1.pk}/passport/").data
        self.assertEqual(len(passport["maintenance"]), 1)
        self.assertEqual(passport["current_tenant"]["full_name"], new_tenant.full_name)
