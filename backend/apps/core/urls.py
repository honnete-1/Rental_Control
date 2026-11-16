from django.urls import path

from . import views

urlpatterns = [
    path("dashboard/landlord/", views.landlord_dashboard, name="dashboard-landlord"),
    path("dashboard/tenant/", views.tenant_dashboard, name="dashboard-tenant"),
    path("search/", views.search, name="search"),
]
