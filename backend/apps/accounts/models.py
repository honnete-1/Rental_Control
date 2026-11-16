from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra):
        if not email:
            raise ValueError("An email address is required.")
        email = self.normalize_email(email).lower()
        user = self.model(email=email, **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra):
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra)

    def create_superuser(self, email, password=None, **extra):
        extra.update(is_staff=True, is_superuser=True, role=User.Role.ADMIN)
        return self._create_user(email, password, **extra)


class User(AbstractUser):
    class Role(models.TextChoices):
        LANDLORD = "landlord", "Landlord"
        MANAGER = "manager", "Property manager"
        TENANT = "tenant", "Tenant"
        ADMIN = "admin", "Administrator"

    class Language(models.TextChoices):
        ENGLISH = "en", "English"
        KINYARWANDA = "rw", "Kinyarwanda"
        FRENCH = "fr", "Français"

    class TextSize(models.TextChoices):
        NORMAL = "normal", "Normal"
        LARGE = "large", "Large"

    username = None
    first_name = None
    last_name = None

    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=150)
    phone = models.CharField(max_length=32, blank=True)
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.LANDLORD, db_index=True)
    language = models.CharField(max_length=5, choices=Language.choices, default=Language.ENGLISH)
    text_size = models.CharField(max_length=10, choices=TextSize.choices, default=TextSize.NORMAL)
    onboarding_completed = models.BooleanField(default=False)
    is_demo = models.BooleanField(default=False, help_text="Development-only sample account.")

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["full_name"]

    objects = UserManager()

    class Meta:
        ordering = ["full_name"]

    def __str__(self):
        return f"{self.full_name} <{self.email}>"

    @property
    def is_tenant(self):
        return self.role == self.Role.TENANT
