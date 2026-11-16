from django.contrib.auth import password_validation
from rest_framework import serializers

from .models import User


class UserSerializer(serializers.ModelSerializer):
    unread_notifications = serializers.SerializerMethodField()
    has_home = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "email", "full_name", "phone", "role", "language", "text_size",
            "onboarding_completed", "unread_notifications", "has_home", "is_demo",
        ]
        read_only_fields = ["id", "email", "role", "unread_notifications", "has_home", "is_demo"]

    def get_unread_notifications(self, obj) -> int:
        return obj.notifications.filter(read_at__isnull=True).count()

    def get_has_home(self, obj) -> bool:
        return obj.tenancies.filter(moved_out_on__isnull=True).exists()


class SignupSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, min_length=8, max_length=128)
    role = serializers.ChoiceField(choices=[User.Role.LANDLORD, User.Role.MANAGER], default=User.Role.LANDLORD)
    language = serializers.ChoiceField(choices=User.Language.choices, default=User.Language.ENGLISH)

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists. Try signing in.", code="email_taken")
        return value

    def validate(self, attrs):
        candidate = User(email=attrs["email"], full_name=attrs["full_name"])
        try:
            password_validation.validate_password(attrs["password"], candidate)
        except Exception as exc:  # django ValidationError
            raise serializers.ValidationError({"password": [serializers.ErrorDetail(m, code="weak_password") for m in exc.messages]})
        return attrs

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, max_length=128)


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True, max_length=128)
    new_password = serializers.CharField(write_only=True, min_length=8, max_length=128)

    def validate_current_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("Your current password is not correct.", code="wrong_password")
        return value

    def validate_new_password(self, value):
        try:
            password_validation.validate_password(value, self.context["request"].user)
        except Exception as exc:
            raise serializers.ValidationError([serializers.ErrorDetail(m, code="weak_password") for m in exc.messages])
        return value


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField(max_length=64)
    token = serializers.CharField(max_length=128)
    new_password = serializers.CharField(write_only=True, min_length=8, max_length=128)


class InvitationAcceptSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=150, required=False)
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, min_length=8, max_length=128, required=False)
    language = serializers.ChoiceField(choices=User.Language.choices, required=False)
