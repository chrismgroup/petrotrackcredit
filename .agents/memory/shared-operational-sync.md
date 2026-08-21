---
name: Shared operational sync
description: Durability rules for workflow records written by multiple PetroTrack devices
---

Shared operational records are sent as complete client-side arrays, but those arrays are not authoritative snapshots. The API must merge records by stable ID and select the newest workflow version so a stale device cannot erase another device's submission.

**Why:** A locally restored session can submit or persist an older array while another device has already added or approved a record. Replacing the server array makes records disappear and leaves dependent dashboards stale.

**How to apply:** Add server-side and client-side merge logic for every shared workflow array, prioritize workflow status rank before timestamps so stale pending copies cannot replace approved records, and flush locally preserved records after the authenticated initial sync opens the write gate. Keep explicit deletion semantics separate from ordinary stale-array reconciliation.