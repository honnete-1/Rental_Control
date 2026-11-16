from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("expenses", views.ExpenseViewSet, basename="expense")
router.register("rent/payments", views.RentPaymentViewSet, basename="rent-payment")
router.register("rent/tenancies", views.RentLedgerViewSet, basename="rent-ledger")

urlpatterns = [
    path("finance/summary/", views.finance_summary, name="finance-summary"),
    path("my-payments/", views.my_payments, name="my-payments"),
    *router.urls,
]
