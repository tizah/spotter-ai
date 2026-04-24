from __future__ import annotations

import pytest


@pytest.mark.django_db
def test_health_endpoint_returns_ok(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["service"] == "spotter-planner"
