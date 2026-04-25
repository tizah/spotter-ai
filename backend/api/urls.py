from __future__ import annotations

from django.urls import path

from .views import HealthView, TripCreateView, TripRetrieveView

urlpatterns = [
    path("trips", TripCreateView.as_view(), name="trips-create"),
    path("trips/<uuid:id>", TripRetrieveView.as_view(), name="trips-retrieve"),
    path("health", HealthView.as_view(), name="health"),
]
