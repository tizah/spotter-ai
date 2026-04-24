from __future__ import annotations

import uuid

from django.db import models


class Trip(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    input_payload = models.JSONField()
    plan_payload = models.JSONField()

    class Meta:
        ordering = ["-created_at"]
