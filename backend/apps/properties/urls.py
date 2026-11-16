from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter(trailing_slash=True)
router.register("properties", views.PropertyViewSet, basename="property")
router.register("units", views.UnitViewSet, basename="unit")
router.register("tenancies", views.TenancyViewSet, basename="tenancy")
router.register("invitations", views.InvitationViewSet, basename="invitation")

urlpatterns = [path("my-home/", views.my_home, name="my-home"), *router.urls]
