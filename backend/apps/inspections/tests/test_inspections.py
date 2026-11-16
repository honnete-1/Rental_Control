from apps.accounts.models import User
from apps.core.tests.helpers import APITestCase, image_file
from apps.notifications.models import Notification


class InspectionTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.owner = self.make_user("owner@example.com")
        self.prop, (self.a1,) = self.make_property(self.owner)
        self.tenant = self.make_user("t@example.com", role=User.Role.TENANT)
        self.make_tenancy(self.a1, self.tenant)
        self.client_ = self.client_for(self.owner)

    def create_inspection(self):
        res = self.client_.post("/api/inspections/", {
            "unit": self.a1.pk, "inspection_type": "move_in", "inspection_date": "2026-01-01",
            "rooms": [{"name": "Kitchen", "has_water": True}, {"name": "Bedroom"}],
        }, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        return res.data

    def test_room_by_room_inspection_flow(self):
        data = self.create_inspection()
        iid = data["id"]
        self.assertEqual(len(data["items"]), 11)  # 6 kitchen (with plumbing) + 5 bedroom
        self.assertEqual(data["inspector_name"], self.owner.full_name)
        kitchen_plumbing = next(i for i in data["items"] if i["area"] == "Kitchen" and i["element"] == "plumbing")
        others = [{"id": i["id"], "condition": "good"} for i in data["items"] if i["id"] != kitchen_plumbing["id"]]
        res = self.client_.patch(f"/api/inspections/{iid}/", {"items": others + [{"id": kitchen_plumbing["id"], "condition": "damaged", "notes": "Leak"}]}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["counts"]["damaged"], 1)
        res = self.client_.post(f"/api/inspections/{iid}/rooms/", {"rooms": [{"name": "Bathroom", "has_water": True}]}, format="json")
        self.assertEqual(len(res.data["items"]), 17)
        res = self.client_.post(f"/api/inspections/{iid}/photos/", {"image": image_file(), "area": "Kitchen", "caption": "Sink"}, format="multipart")
        self.assertEqual(res.status_code, 201)
        res = self.client_.post(f"/api/inspections/{iid}/complete/")
        self.assertEqual(res.data["status"], "completed")
        self.assertTrue(Notification.objects.filter(recipient=self.tenant, kind="inspection_shared").exists())
        # Completed inspections are locked evidence.
        self.assertEqual(self.client_.patch(f"/api/inspections/{iid}/", {"summary": "changed"}, format="json").status_code, 409)
        self.assertEqual(self.client_.post(f"/api/inspections/{iid}/photos/", {"image": image_file()}, format="multipart").status_code, 409)
        self.assertEqual(self.client_.delete(f"/api/inspections/{iid}/").status_code, 409)
        # Passport shows the latest condition and photos.
        passport = self.client_.get(f"/api/units/{self.a1.pk}/passport/").data
        kitchen = next(r for r in passport["latest_condition"]["rooms"] if r["area"] == "Kitchen")
        self.assertEqual(kitchen["condition"], "damaged")
        self.assertEqual(len(passport["photos"]), 1)
        unit = self.client_.get(f"/api/units/{self.a1.pk}/").data
        self.assertEqual(unit["latest_condition"]["overall"], "damaged")

    def test_tenant_sees_only_completed_shared_inspections_of_own_stay(self):
        data = self.create_inspection()
        tclient = self.client_for(self.tenant)
        self.assertEqual(tclient.get("/api/inspections/").data["count"], 0)  # still a draft
        self.client_.post(f"/api/inspections/{data['id']}/complete/")
        self.assertEqual(tclient.get("/api/inspections/").data["count"], 1)
        self.assertEqual(tclient.post("/api/inspections/", {"unit": self.a1.pk, "inspection_type": "periodic", "inspection_date": "2026-02-01"}, format="json").status_code, 403)
        other = self.make_user("o@example.com", role=User.Role.TENANT)
        self.assertEqual(self.client_for(other).get(f"/api/inspections/{data['id']}/").status_code, 404)

    def test_cannot_complete_empty_inspection_or_inspect_foreign_unit(self):
        res = self.client_.post("/api/inspections/", {"unit": self.a1.pk, "inspection_type": "periodic", "inspection_date": "2026-02-01"}, format="json")
        self.assertEqual(self.client_.post(f"/api/inspections/{res.data['id']}/complete/").status_code, 409)
        other_owner = self.make_user("x@example.com")
        res = self.client_for(other_owner).post("/api/inspections/", {"unit": self.a1.pk, "inspection_type": "periodic", "inspection_date": "2026-02-01"}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_protected_media_requires_permission(self):
        data = self.create_inspection()
        photo = self.client_.post(f"/api/inspections/{data['id']}/photos/", {"image": image_file()}, format="multipart").data
        path = photo["image"]
        from django.test import Client

        owner = Client()
        owner.force_login(self.owner)
        self.assertEqual(owner.get(path).status_code, 200)

        self.assertEqual(Client().get(path).status_code, 404)
        stranger = self.make_user("x@example.com")
        c = Client()
        c.force_login(stranger)
        self.assertEqual(c.get(path).status_code, 404)
        # Tenant cannot see draft photos.
        t = Client()
        t.force_login(self.tenant)
        self.assertEqual(t.get(path).status_code, 404)
