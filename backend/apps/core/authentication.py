from rest_framework.authentication import SessionAuthentication


class SessionAuthentication401(SessionAuthentication):
    """Session authentication that answers 401 (not 403) when the user is not signed in,
    so the web app can tell "please sign in" apart from "not allowed"."""

    def authenticate_header(self, request):
        return 'Session realm="api"'
