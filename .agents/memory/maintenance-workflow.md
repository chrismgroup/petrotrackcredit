---
name: Maintenance workflow authority
description: Durable rules for maintenance request state, authorization, history, and reset behavior
---

Maintenance requests are workflow records, not ordinary operational-array data. New requests need a server-authoritative task identifier, and receipt, assignment, and status changes must be authenticated API actions that append history and durable inbox notifications.

**Why:** Client-side whole-array writes allowed stale devices to overwrite concurrent maintenance work and could not reliably enforce MD/CEO decisions.

**How to apply:** Keep maintenance out of generic state mutation and operational reset paths. Preserve server-side role checks, assignee checks, transition validation, and transaction locking even when adding new mobile controls.