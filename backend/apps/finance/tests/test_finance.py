from datetime import date
from unittest import mock

from apps.accounts.models import User
from apps.core.tests.helpers import APITestCase
from apps.finance.services import ensure_rent_charges, tenancy_ledger

TODAY = date(2026, 4, 20)


@mock.patch("apps.finance.services.today", return_value=TODAY)
class FinanceTests(APITestCase):
    def setUp(self):
        super().setUp()
        self.owner = self.make_user("owner@example.com")
        self.prop, (self.a1, self.a2) = self.make_property(self.owner, units=("A1", "A2"))
        self.tenant = self.make_user("t@example.com", role=User.Role.TENANT)
        self.tenancy = self.make_tenancy(self.a1, self.tenant, start=date(2026, 1, 15), rent=250_000, due_day=5)
        self.client_ = self.client_for(self.owner)

    def test_rent_charges_generated_monthly(self, _):
        ensure_rent_charges(self.tenancy, TODAY)
        charges = list(self.tenancy.rent_charges.values_list("period_start", "due_date"))
        self.assertEqual(charges[0], (date(2026, 1, 1), date(2026, 1, 15)))  # first month due on move-in day
        self.assertEqual(charges[-1], (date(2026, 4, 1), date(2026, 4, 5)))
        self.assertEqual(len(charges), 4)
        ensure_rent_charges(self.tenancy, TODAY)  # idempotent
        self.assertEqual(self.tenancy.rent_charges.count(), 4)

    def test_ledger_outstanding_and_overdue(self, _):
        for paid_on in ("2026-01-15", "2026-02-05"):
            r = self.client_.post("/api/rent/payments/", {"tenancy": self.tenancy.pk, "amount": 250000, "paid_on": paid_on, "method": "mobile_money"}, format="json")
            self.assertEqual(r.status_code, 201, r.data)
        self.client_.post("/api/rent/payments/", {"tenancy": self.tenancy.pk, "amount": 100000, "paid_on": "2026-03-10"}, format="json")
        ledger = tenancy_ledger(self.tenancy, TODAY)
        self.assertEqual(ledger["total_due_to_date"], 1_000_000)
        self.assertEqual(ledger["total_paid"], 600_000)
        self.assertEqual(ledger["outstanding"], 400_000)
        self.assertEqual([c["status"] for c in ledger["charges"]], ["paid", "paid", "overdue", "overdue"])
        self.assertEqual(ledger["charges"][2]["amount_paid"], 100_000)
        rows = self.client_.get("/api/rent/tenancies/").data
        self.assertEqual(rows[0]["outstanding"], 400_000)
        self.assertEqual(rows[0]["overdue_count"], 2)

    def test_summary_totals_and_no_double_counting(self, _):
        self.client_.post("/api/rent/payments/", {"tenancy": self.tenancy.pk, "amount": 250000, "paid_on": "2026-04-05"}, format="json")
        self.client_.post("/api/expenses/", {"property": self.prop.pk, "category": "security", "amount": 60000, "spent_on": "2026-04-01", "description": "Guard"}, format="json")
        # A repair cost recorded through maintenance is counted once.
        tclient = self.client_for(self.tenant)
        req = tclient.post("/api/maintenance/", {"category": "plumbing", "description": "Sink leaking"}, format="json").data
        self.client_.post(f"/api/maintenance/{req['id']}/repair/", {"description": "Fixed", "completed_on": "2026-04-10", "cost": 45000}, format="json")
        # Outside the period: not counted.
        self.client_.post("/api/expenses/", {"property": self.prop.pk, "category": "other", "amount": 999, "spent_on": "2026-03-31", "description": "Old"}, format="json")
        s = self.client_.get("/api/finance/summary/?date_from=2026-04-01&date_to=2026-04-30").data
        self.assertEqual(s["rent_received"], 250_000)
        self.assertEqual(s["rent_due"], 250_000)
        self.assertEqual(s["maintenance_expenses"], 45_000)
        self.assertEqual(s["other_expenses"], 60_000)
        self.assertEqual(s["net_cash_flow"], 250_000 - 105_000)
        self.assertEqual(s["occupancy"], {"units": 2, "occupied": 1, "vacant": 1})
        self.assertEqual(s["outstanding"], 750_000)  # Jan-Mar unpaid
        expenses = self.client_.get("/api/expenses/?date_from=2026-04-01&date_to=2026-04-30").data
        self.assertEqual(expenses["total_amount"], 105_000)

    def test_tenant_sees_own_payments_only_when_shared(self, _):
        self.client_.post("/api/rent/payments/", {"tenancy": self.tenancy.pk, "amount": 250000, "paid_on": "2026-01-15"}, format="json")
        tclient = self.client_for(self.tenant)
        data = tclient.get("/api/my-payments/").data
        self.assertTrue(data["enabled"])
        self.assertEqual(data["total_paid"], 250_000)
        self.assertEqual(tclient.get("/api/rent/payments/").status_code, 403)
        self.tenancy.share_payments_with_tenant = False
        self.tenancy.save()
        self.assertFalse(tclient.get("/api/my-payments/").data["enabled"])

    def test_other_landlord_cannot_record_payment(self, _):
        stranger = self.client_for(self.make_user("x@example.com"))
        r = stranger.post("/api/rent/payments/", {"tenancy": self.tenancy.pk, "amount": 1000, "paid_on": "2026-04-01"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(stranger.get(f"/api/rent/tenancies/{self.tenancy.pk}/").status_code, 404)

    def test_amounts_must_be_positive_integers(self, _):
        r = self.client_.post("/api/expenses/", {"property": self.prop.pk, "category": "other", "amount": "12.5", "spent_on": "2026-04-01", "description": "x"}, format="json")
        self.assertEqual(r.status_code, 400)
        r = self.client_.post("/api/rent/payments/", {"tenancy": self.tenancy.pk, "amount": 0, "paid_on": "2026-04-01"}, format="json")
        self.assertEqual(r.status_code, 400)


class DashboardTests(APITestCase):
    def test_dashboard_counts_come_from_database(self):
        owner = self.make_user("owner@example.com")
        prop, (a1, a2, b1) = self.make_property(owner, units=("A1", "A2", "B1"))
        tenant = self.make_user("t@example.com", role=User.Role.TENANT)
        self.make_tenancy(a1, tenant)
        tclient = self.client_for(tenant)
        tclient.post("/api/maintenance/", {"category": "plumbing", "description": "Water leaking", "priority": "urgent"}, format="json")
        tclient.post("/api/maintenance/", {"category": "other", "description": "Door squeaks", "priority": "low"}, format="json")
        data = self.client_for(owner).get("/api/dashboard/landlord/").data
        self.assertEqual(data["properties"], 1)
        self.assertEqual(data["units"], 3)
        self.assertEqual(data["occupied_units"], 1)
        self.assertEqual(data["vacant_units"], 2)
        self.assertEqual(data["open_requests"], 2)
        self.assertEqual(data["urgent_requests"], 1)
        self.assertEqual(data["needs_attention"][0]["priority"], "urgent")
        tdata = tclient.get("/api/dashboard/tenant/").data
        self.assertEqual(tdata["home"]["unit_name"], "A1")
        self.assertEqual(tdata["open_count"], 2)
        empty = self.client_for(self.make_user("new@example.com")).get("/api/dashboard/landlord/").data
        self.assertEqual(empty["properties"], 0)
        self.assertEqual(empty["needs_attention"], [])
