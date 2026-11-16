from apps.accounts.models import User
from apps.core.tests.helpers import APITestCase, image_file
from apps.finance.models import Expense
from apps.maintenance.models import MaintenanceRequest, MaintenanceUpdate
from apps.notifications.models import Notification


class MaintenanceTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.owner = self.make_user("owner@example.com")
        self.prop, (self.a1, self.a2) = self.make_property(self.owner, units=("A1", "A2"))
        self.tenant = self.make_user("t@example.com", role=User.Role.TENANT)
        self.neighbour = self.make_user("n@example.com", role=User.Role.TENANT)
        self.make_tenancy(self.a1, self.tenant)
        self.make_tenancy(self.a2, self.neighbour)
        self.tclient = self.client_for(self.tenant)
        self.oclient = self.client_for(self.owner)

    def report(self):
        res = self.tclient.post("/api/maintenance/", {
            "category": "plumbing", "description": "Kitchen sink is leaking", "location_in_home": "Kitchen",
            "priority": "urgent", "photos": [image_file()],
        }, format="multipart")
        self.assertEqual(res.status_code, 201, res.data)
        return res.data

    def test_tenant_reports_problem_with_photo_unit_is_automatic(self):
        data = self.report()
        self.assertTrue(data["reference"].startswith("RC-"))
        req = MaintenanceRequest.objects.get(pk=data["id"])
        self.assertEqual(req.unit, self.a1)
        self.assertEqual(req.photos.count(), 1)
        self.assertEqual(req.status, "new")
        self.assertTrue(Notification.objects.filter(recipient=self.owner, kind="request_created").exists())

    def test_tenant_cannot_pick_another_unit(self):
        res = self.tclient.post("/api/maintenance/", {"category": "other", "description": "Broken door handle", "unit": self.a2.pk}, format="json")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(MaintenanceRequest.objects.get(pk=res.data["id"]).unit, self.a1)

    def test_tenants_cannot_see_each_others_requests(self):
        data = self.report()
        nclient = self.client_for(self.neighbour)
        self.assertEqual(nclient.get("/api/maintenance/").data["count"], 0)
        self.assertEqual(nclient.get(f"/api/maintenance/{data['id']}/").status_code, 404)
        self.assertEqual(nclient.post(f"/api/maintenance/{data['id']}/notes/", {"message": "hi"}, format="json").status_code, 404)

    def test_tenant_cannot_change_status(self):
        data = self.report()
        res = self.tclient.post(f"/api/maintenance/{data['id']}/status/", {"status": "resolved"}, format="json")
        self.assertEqual(res.status_code, 403)

    def test_full_maintenance_lifecycle(self):
        data = self.report()
        rid = data["id"]
        r = self.oclient.post(f"/api/maintenance/{rid}/status/", {"status": "under_review", "message": "Plumber coming"}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        r = self.oclient.post(f"/api/maintenance/{rid}/status/", {"status": "approved"}, format="json")
        self.assertEqual(r.data["status"], "approved")
        r = self.oclient.patch(f"/api/maintenance/{rid}/", {"provider_name": "Gakwaya Plumbing", "provider_phone": "0788"}, format="json")
        self.assertEqual(r.data["provider_name"], "Gakwaya Plumbing")
        r = self.oclient.post(f"/api/maintenance/{rid}/status/", {"status": "in_progress"}, format="json")
        self.assertEqual(r.data["status"], "in_progress")
        r = self.oclient.post(f"/api/maintenance/{rid}/photos/", {"image": image_file(), "phase": "after"}, format="multipart")
        self.assertEqual(r.status_code, 201)
        r = self.oclient.post(f"/api/maintenance/{rid}/repair/", {
            "description": "Replaced pipe", "completed_on": "2026-03-02", "cost": 45000,
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data["status"], "resolved")
        self.assertEqual(r.data["repair"]["cost"], 45000)
        self.assertEqual(Expense.objects.get().amount, 45000)
        # Timeline is complete and the tenant was told.
        kinds = list(MaintenanceUpdate.objects.filter(request_id=rid).values_list("kind", flat=True))
        self.assertEqual(kinds.count("status_changed"), 4)
        self.assertIn("repair_recorded", kinds)
        self.assertTrue(Notification.objects.filter(recipient=self.tenant, kind="repair_completed").exists())
        # Status persists and the tenant sees it, but not the cost.
        tview = self.tclient.get(f"/api/maintenance/{rid}/").data
        self.assertEqual(tview["status"], "resolved")
        self.assertNotIn("cost", tview["repair"])
        # Passport shows the history.
        passport = self.oclient.get(f"/api/units/{self.a1.pk}/passport/").data
        self.assertEqual(passport["totals"]["repair_cost"], 45000)
        self.assertEqual(passport["repairs"][0]["request_reference"], data["reference"])
        # Second repair or duplicate expense is refused.
        self.assertEqual(self.oclient.post(f"/api/maintenance/{rid}/repair/", {"description": "x", "completed_on": "2026-03-02"}, format="json").status_code, 409)
        dup = self.oclient.post("/api/expenses/", {"property": self.prop.pk, "category": "repair", "amount": 45000, "spent_on": "2026-03-02", "description": "sink", "maintenance_request": rid}, format="json")
        self.assertEqual(dup.status_code, 400)
        self.assertEqual(dup.data["fields"]["maintenance_request"][0]["code"], "already_counted")
        # Close.
        r = self.oclient.post(f"/api/maintenance/{rid}/status/", {"status": "closed"}, format="json")
        self.assertEqual(r.data["status"], "closed")

    def test_invalid_transition_rejected(self):
        data = self.report()
        res = self.oclient.post(f"/api/maintenance/{data['id']}/status/", {"status": "in_progress"}, format="json")
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data["code"], "invalid_transition")

    def test_internal_notes_hidden_from_tenant(self):
        data = self.report()
        self.oclient.post(f"/api/maintenance/{data['id']}/notes/", {"message": "Internal: check warranty", "visible_to_tenant": False}, format="json")
        self.oclient.post(f"/api/maintenance/{data['id']}/notes/", {"message": "We are on it"}, format="json")
        messages = [u["message"] for u in self.tclient.get(f"/api/maintenance/{data['id']}/").data["updates"]]
        self.assertIn("We are on it", messages)
        self.assertNotIn("Internal: check warranty", messages)

    def test_editing_repair_cost_updates_single_expense(self):
        data = self.report()
        self.oclient.post(f"/api/maintenance/{data['id']}/repair/", {"description": "Fixed", "completed_on": "2026-03-02", "cost": 45000}, format="json")
        repair_id = MaintenanceRequest.objects.get(pk=data["id"]).repair.pk
        r = self.oclient.patch(f"/api/repairs/{repair_id}/", {"cost": 50000}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(Expense.objects.count(), 1)
        self.assertEqual(Expense.objects.get().amount, 50000)
        expense = Expense.objects.get()
        self.assertEqual(self.oclient.patch(f"/api/expenses/{expense.pk}/", {"amount": 1}, format="json").status_code, 409)

    def test_other_landlord_cannot_manage_request(self):
        data = self.report()
        stranger = self.client_for(self.make_user("x@example.com"))
        self.assertEqual(stranger.get(f"/api/maintenance/{data['id']}/").status_code, 404)
        self.assertEqual(stranger.post(f"/api/maintenance/{data['id']}/status/", {"status": "closed"}, format="json").status_code, 404)

    def test_filters(self):
        self.report()
        self.tclient.post("/api/maintenance/", {"category": "electricity", "description": "Light not working", "priority": "low"}, format="json")
        self.assertEqual(self.oclient.get("/api/maintenance/?priority=urgent").data["count"], 1)
        self.assertEqual(self.oclient.get("/api/maintenance/?category=electricity").data["count"], 1)
        self.assertEqual(self.oclient.get(f"/api/maintenance/?property={self.prop.pk}&open=true").data["count"], 2)
        self.assertEqual(self.oclient.get("/api/maintenance/?search=sink").data["count"], 1)
        self.assertEqual(self.oclient.get("/api/maintenance/?date_from=2000-01-01&date_to=2000-01-02").data["count"], 0)
