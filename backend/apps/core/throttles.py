from rest_framework.throttling import SimpleRateThrottle


class AuthThrottle(SimpleRateThrottle):
    """Limits sign-in, sign-up and password-reset attempts per IP address."""

    scope = "auth"

    def get_cache_key(self, request, view):
        if request.method == "GET":
            return None
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class UploadThrottle(SimpleRateThrottle):
    """Limits how many files one user can upload per hour."""

    scope = "uploads"

    def get_cache_key(self, request, view):
        if request.method != "POST" or not request.user.is_authenticated:
            return None
        return self.cache_format % {"scope": self.scope, "ident": request.user.pk}
