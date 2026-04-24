from __future__ import annotations

from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthView(APIView):
    @extend_schema(responses={200: dict})
    def get(self, request: object) -> Response:
        return Response({"status": "ok", "service": "spotter-planner"})
