from __future__ import annotations

from rest_framework import serializers


class GeoPointInputSerializer(serializers.Serializer):
    lat = serializers.FloatField(min_value=-90, max_value=90, required=False)
    lon = serializers.FloatField(min_value=-180, max_value=180, required=False)
    label = serializers.CharField(required=False, allow_blank=True, max_length=500)

    def validate(self, attrs: dict) -> dict:
        if "lat" not in attrs and "label" not in attrs:
            raise serializers.ValidationError(
                "Must provide either lat/lon or label."
            )
        if ("lat" in attrs) != ("lon" in attrs):
            raise serializers.ValidationError(
                "Must provide both lat and lon together."
            )
        return attrs


class TripInputSerializer(serializers.Serializer):
    current_location = GeoPointInputSerializer()
    pickup_location = GeoPointInputSerializer()
    dropoff_location = GeoPointInputSerializer()
    cycle_hours_used = serializers.FloatField(min_value=0, max_value=70)
    start_datetime = serializers.DateTimeField(required=False)
    home_terminal_tz = serializers.CharField(
        required=False, default="America/Chicago", max_length=64
    )
