"""End-to-end journeys through the real API, exactly as the web app calls it
(session cookies, CSRF checks on, multipart uploads). Mirrors journeys A–F of the brief."""

from datetime import timedelta

from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.tests.helpers import PASSWORD, APITestCase, image_file


class BrowserLikeClient(APIClient):
    """Sends the CSRF header like the frontend does."""

    def __init__(self):
        super().__init__(enforce_csrf_checks=True)
        self.get("/api/auth/csrf/")

    def generic(self, method, path, *args, **kwargs):
        token = self.cookies.get("csrftoken")
        if method != "GET" and token:
            kwargs.setdefault("HTTP_X_CSRFTOKEN", token.value)
        return super().generic(method, path, *args, **kwargs)


class JourneyTests(APITestCase):
    def ok(self, res, code=200):
        self.assertEqual(res.status_code, code, getattr(res, "data", res))
        return res.data

    def test_full_landlord_tenant_maintenance_passport_and_money_journey(self):
        today = timezone.localdate()
        # Journey A — landlord signs up, adds a property and a unit, invites a tenant.
        landlord = BrowserLikeClient()
        self.ok(landlord.post("/api/auth/signup/", {"full_name": "Jean Mugenzi", "email": "jean@example.com", "password": PASSWORD}, format="json"), 201)
        prop = self.ok(landlord.post("/api/properties/", {"name": "Kibagabaga Residence", "district": "Gasabo", "photo": image_file()}, format="multipart"), 201)
        unit = self.ok(landlord.post("/api/units/", {"property": prop["id"], "name": "A1", "monthly_rent": 250000}, format="json"), 201)
        invite = self.ok(landlord.post(f"/api/units/{unit['id']}/invite/", {"full_name": "Eric N", "email": "eric@example.com", "start_date": str(today.replace(day=1))}, format="json"), 201)
        token = invite["invite_link"].rsplit("/", 1)[1]
        dashboard = self.ok(landlord.get("/api/dashboard/landlord/"))
        self.assertEqual((dashboard["properties"], dashboard["units"], dashboard["occupied_units"]), (1, 1, 0))

        # Journey B — tenant accepts, reports a problem with a photo, sees the status.
        tenant = BrowserLikeClient()
        self.ok(tenant.post(f"/api/auth/invitations/{token}/accept/", {"password": PASSWORD, "language": "rw"}, format="json"))
        self.assertEqual(self.ok(tenant.get("/api/my-home/"))["unit"]["name"], "A1")
        req = self.ok(tenant.post("/api/maintenance/", {"category": "plumbing", "description": "Kitchen sink leakage", "priority": "urgent", "photos": [image_file()]}, format="multipart"), 201)
        self.assertEqual(self.ok(tenant.get(f"/api/maintenance/{req['id']}/"))["status"], "new")

        # Journey C — landlord reviews, approves, starts, records the repair; tenant sees it resolved.
        attention = self.ok(landlord.get("/api/dashboard/landlord/"))["needs_attention"]
        self.assertEqual(attention[0]["reference"], req["reference"])
        for status in ("under_review", "approved", "in_progress"):
            self.ok(landlord.post(f"/api/maintenance/{req['id']}/status/", {"status": status}, format="json"))
        self.ok(landlord.post(f"/api/maintenance/{req['id']}/repair/", {"description": "Replaced the pipe", "completed_on": str(today), "cost": 45000}, format="json"), 201)
        tenant_view = self.ok(tenant.get(f"/api/maintenance/{req['id']}/"))
        self.assertEqual(tenant_view["status"], "resolved")
        self.assertEqual([u["to_status"] for u in tenant_view["updates"] if u["kind"] == "status_changed"], ["under_review", "approved", "in_progress", "resolved"])

        # Journey D — inspection with conditions and photos becomes part of the passport.
        insp = self.ok(landlord.post("/api/inspections/", {"unit": unit["id"], "inspection_type": "periodic", "inspection_date": str(today), "rooms": [{"name": "Kitchen", "has_water": True}]}, format="json"), 201)
        items = [{"id": i["id"], "condition": "damaged" if i["element"] == "plumbing" else "good"} for i in insp["items"]]
        self.ok(landlord.patch(f"/api/inspections/{insp['id']}/", {"items": items}, format="json"))
        self.ok(landlord.post(f"/api/inspections/{insp['id']}/photos/", {"image": image_file(), "area": "Kitchen"}, format="multipart"), 201)
        self.ok(landlord.post(f"/api/inspections/{insp['id']}/complete/"))
        passport = self.ok(landlord.get(f"/api/units/{unit['id']}/passport/"))
        self.assertEqual(passport["latest_condition"]["rooms"][0]["condition"], "damaged")
        self.assertEqual(passport["totals"], {"open_requests": 0, "completed_repairs": 1, "repair_cost": 45000, "inspections": 1})
        self.assertEqual(len(passport["photos"]), 2)  # one inspection photo + one maintenance photo
        self.assertEqual(self.ok(tenant.get("/api/inspections/"))["count"], 1)

        # Journey F — record rent and an expense; totals add up without double counting.
        tenancy_id = self.ok(landlord.get("/api/rent/tenancies/"))[0]["tenancy_id"]
        self.ok(landlord.post("/api/rent/payments/", {"tenancy": tenancy_id, "amount": 250000, "paid_on": str(today), "method": "mobile_money"}, format="json"), 201)
        self.ok(landlord.post("/api/expenses/", {"property": prop["id"], "category": "security", "amount": 60000, "spent_on": str(today), "description": "Guard"}, format="json"), 201)
        summary = self.ok(landlord.get(f"/api/finance/summary/?date_from={today.replace(day=1)}&date_to={today}"))
        self.assertEqual(summary["rent_received"], 250000)
        self.assertEqual(summary["maintenance_expenses"], 45000)
        self.assertEqual(summary["other_expenses"], 60000)
        self.assertEqual(summary["net_cash_flow"], 145000)
        self.assertEqual(self.ok(tenant.get("/api/my-payments/"))["total_paid"], 250000)

        # The tenant gets updates in-app; and cannot reach landlord data.
        kinds = {n["kind"] for n in self.ok(tenant.get("/api/notifications/"))["results"]}
        self.assertTrue({"tenancy_started", "request_status", "repair_completed", "inspection_shared", "payment_recorded"} <= kinds)
        self.assertEqual(tenant.get("/api/finance/summary/").status_code, 403)
        self.assertEqual(tenant.get(f"/api/properties/{prop['id']}/").status_code, 403)

    def test_manager_without_money_permission_is_told_clearly(self):
        owner = self.make_user("owner@example.com")
        manager = self.make_user("m@example.com", role="manager")
        prop, _ = self.make_property(owner)
        prop.manager_assignments.create(manager=manager, can_view_finances=False)
        res = self.client_for(manager).get("/api/finance/summary/")
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.data["code"], "no_finance_access")
        prop.manager_assignments.update(can_view_finances=True)
        self.assertEqual(self.client_for(manager).get("/api/finance/summary/").status_code, 200)

    def test_seed_command_refuses_without_flag(self):
        from django.core.management import CommandError, call_command
        from django.test import override_settings

        with override_settings(ALLOW_DEMO_SEED=False):
            with self.assertRaises(CommandError):
                call_command("seed_demo")

    def test_expired_invitation_cannot_be_used(self):
        owner = self.make_user("owner@example.com")
        _, (unit,) = self.make_property(owner)
        data = self.client_for(owner).post(f"/api/units/{unit.pk}/invite/", {"full_name": "X", "email": "x@example.com", "start_date": "2026-01-01"}, format="json").data
        unit.invitations.update(expires_at=timezone.now() - timedelta(minutes=1))
        token = data["invite_link"].rsplit("/", 1)[1]
        res = APIClient().post(f"/api/auth/invitations/{token}/accept/", {"password": PASSWORD}, format="json")
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data["code"], "invitation_expired")
