from django.conf import settings
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from apps.core.views import health, protected_media

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health, name="health"),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/", include("apps.properties.urls")),
    path("api/", include("apps.inspections.urls")),
    path("api/", include("apps.maintenance.urls")),
    path("api/", include("apps.finance.urls")),
    path("api/", include("apps.notifications.urls")),
    path("api/", include("apps.core.urls")),
    # Uploaded files are served through a permission check, never as public static files.
    path(f"{settings.MEDIA_URL.strip('/')}/<path:file_path>", protected_media, name="protected-media"),
]
