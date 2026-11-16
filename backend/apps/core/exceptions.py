"""Consistent, translatable error responses.

Every error response has the shape::

    {"code": "validation_error", "detail": "...",
     "fields": {"name": [{"code": "required", "message": "..."}]}}

The frontend translates by ``code`` and falls back to ``message``.
"""

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler


def _flatten(detail):
    if isinstance(detail, dict):
        return {key: _flatten(value) for key, value in detail.items()}
    if isinstance(detail, list):
        if all(isinstance(item, (exceptions.ErrorDetail, str)) for item in detail):
            return [{"code": getattr(item, "code", "invalid"), "message": str(item)} for item in detail]
        return [_flatten(item) for item in detail]
    return [{"code": getattr(detail, "code", "invalid"), "message": str(detail)}]


def friendly_exception_handler(exc, context):
    if isinstance(exc, Http404):
        exc = exceptions.NotFound()
    elif isinstance(exc, DjangoPermissionDenied):
        exc = exceptions.PermissionDenied()
    elif isinstance(exc, DjangoValidationError):
        exc = exceptions.ValidationError(
            exc.message_dict if hasattr(exc, "error_dict") else exc.messages
        )

    response = exception_handler(exc, context)
    if response is None:
        return None

    if isinstance(exc, exceptions.ValidationError):
        body = {"code": "validation_error", "detail": "Please check the highlighted information.", "fields": {}}
        if isinstance(exc.detail, dict):
            fields = _flatten(exc.detail)
            non_field = fields.pop("non_field_errors", None)
            body["fields"] = fields
        else:
            non_field = _flatten(exc.detail)
        if non_field:
            body["errors"] = non_field
            body["detail"] = non_field[0]["message"]
        return Response(body, status=status.HTTP_400_BAD_REQUEST, headers=response.headers)

    detail = getattr(exc, "detail", str(exc))
    code = getattr(detail, "code", None) or getattr(exc, "default_code", "error")
    body = {"code": code, "detail": str(detail)}
    wait = getattr(exc, "wait", None)
    if wait:
        body["wait_seconds"] = int(wait)
    response.data = body
    return response


class BusinessRuleError(exceptions.APIException):
    """A well-formed request that a business rule does not allow."""

    status_code = status.HTTP_409_CONFLICT
    default_code = "conflict"
    default_detail = "This action is not possible right now."
