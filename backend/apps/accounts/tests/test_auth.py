from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.tests.helpers import PASSWORD, APITestCase


class AuthTests(APITestCase):
    def test_signup_creates_landlord_and_signs_in(self):
        client = APIClient()
        res = client.post("/api/auth/signup/", {
            "full_name": "Marie Uwimana", "email": "Marie@Example.com", "password": PASSWORD, "language": "rw",
        }, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["role"], "landlord")
        self.assertEqual(res.data["email"], "marie@example.com")
        self.assertEqual(res.data["language"], "rw")
        self.assertEqual(client.get("/api/auth/me/").status_code, 200)

    def test_signup_cannot_choose_tenant_or_admin_role(self):
        for role in ("tenant", "admin"):
            res = APIClient().post("/api/auth/signup/", {
                "full_name": "X", "email": f"{role}@example.com", "password": PASSWORD, "role": role,
            }, format="json")
            self.assertEqual(res.status_code, 400)
            self.assertIn("role", res.data["fields"])

    def test_signup_rejects_weak_password_and_duplicate_email(self):
        res = APIClient().post("/api/auth/signup/", {"full_name": "A", "email": "a@example.com", "password": "12345678"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["code"], "validation_error")
        self.assertIn("password", res.data["fields"])
        self.make_user("taken@example.com")
        res = APIClient().post("/api/auth/signup/", {"full_name": "B", "email": "TAKEN@example.com", "password": PASSWORD}, format="json")
        self.assertEqual(res.data["fields"]["email"][0]["code"], "email_taken")

    def test_login_logout(self):
        self.make_user("owner@example.com")
        client = APIClient()
        bad = client.post("/api/auth/login/", {"email": "owner@example.com", "password": "wrong-password"}, format="json")
        self.assertEqual(bad.status_code, 401)
        self.assertEqual(bad.data["code"], "invalid_credentials")
        ok = client.post("/api/auth/login/", {"email": "OWNER@example.com", "password": PASSWORD}, format="json")
        self.assertEqual(ok.status_code, 200)
        client.post("/api/auth/logout/")
        self.assertIn(client.get("/api/auth/me/").status_code, (401, 403))

    def test_login_requires_csrf_token(self):
        self.make_user("owner@example.com")
        client = APIClient(enforce_csrf_checks=True)
        res = client.post("/api/auth/login/", {"email": "owner@example.com", "password": PASSWORD}, format="json")
        self.assertEqual(res.status_code, 403)
        client.get("/api/auth/csrf/")
        token = client.cookies["csrftoken"].value
        res = client.post("/api/auth/login/", {"email": "owner@example.com", "password": PASSWORD}, format="json", HTTP_X_CSRFTOKEN=token)
        self.assertEqual(res.status_code, 200)

    def test_login_is_rate_limited(self):
        self.make_user("owner@example.com")
        client = APIClient()
        codes = [client.post("/api/auth/login/", {"email": "owner@example.com", "password": "nope-nope"}, format="json").status_code for _ in range(12)]
        self.assertIn(429, codes)

    def test_update_profile_language_and_text_size(self):
        user = self.make_user("owner@example.com")
        client = self.client_for(user)
        res = client.patch("/api/auth/me/", {"language": "fr", "text_size": "large", "role": "admin"}, format="json")
        self.assertEqual(res.status_code, 200)
        user.refresh_from_db()
        self.assertEqual(user.language, "fr")
        self.assertEqual(user.text_size, "large")
        self.assertEqual(user.role, "landlord")  # role is read-only

    def test_password_reset_flow(self):
        user = self.make_user("owner@example.com")
        res = APIClient().post("/api/auth/password-reset/", {"email": "owner@example.com"}, format="json")
        self.assertEqual(res.status_code, 202)
        self.assertEqual(len(mail.outbox), 1)
        # Unknown emails get the same answer and no email.
        res = APIClient().post("/api/auth/password-reset/", {"email": "nobody@example.com"}, format="json")
        self.assertEqual(res.status_code, 202)
        self.assertEqual(len(mail.outbox), 1)
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        res = APIClient().post("/api/auth/password-reset/confirm/", {"uid": uid, "token": token, "new_password": "A-new-strong-pass-7"}, format="json")
        self.assertEqual(res.status_code, 204)
        user.refresh_from_db()
        self.assertTrue(user.check_password("A-new-strong-pass-7"))
        again = APIClient().post("/api/auth/password-reset/confirm/", {"uid": uid, "token": token, "new_password": "Other-strong-pass-8"}, format="json")
        self.assertEqual(again.status_code, 400)

    def test_change_password_requires_current(self):
        user = self.make_user("owner@example.com")
        client = self.client_for(user)
        res = client.post("/api/auth/change-password/", {"current_password": "wrong", "new_password": "Brand-new-pass-55"}, format="json")
        self.assertEqual(res.status_code, 400)
        res = client.post("/api/auth/change-password/", {"current_password": PASSWORD, "new_password": "Brand-new-pass-55"}, format="json")
        self.assertEqual(res.status_code, 204)

    def test_admin_superuser_has_admin_role(self):
        admin = User.objects.create_superuser("root@example.com", PASSWORD, full_name="Root")
        self.assertEqual(admin.role, "admin")
