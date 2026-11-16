from rest_framework.routers import DefaultRouter

from .views import MaintenanceRequestViewSet, RepairViewSet

router = DefaultRouter()
router.register("maintenance", MaintenanceRequestViewSet, basename="maintenance")
router.register("repairs", RepairViewSet, basename="repair")
urlpatterns = router.urls
