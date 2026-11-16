from django.urls import path

from . import views

urlpatterns = [
    path("csrf/", views.csrf, name="auth-csrf"),
    path("signup/", views.signup, name="auth-signup"),
    path("login/", views.login_view, name="auth-login"),
    path("logout/", views.logout_view, name="auth-logout"),
    path("me/", views.me, name="auth-me"),
    path("change-password/", views.change_password, name="auth-change-password"),
    path("password-reset/", views.password_reset, name="auth-password-reset"),
    path("password-reset/confirm/", views.password_reset_confirm, name="auth-password-reset-confirm"),
    path("invitations/<str:token>/", views.invitation_detail, name="invitation-detail"),
    path("invitations/<str:token>/accept/", views.invitation_accept, name="invitation-accept"),
]
