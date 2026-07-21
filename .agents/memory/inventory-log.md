---
name: Inventory log & discrepancy alerts
description: How dip approval creates inventory snapshots and triggers discrepancy notifications
---

# Inventory Log

## Interface
`InventoryLogEntry` (exported from AppContext) has: id, dipId, dt, approvedBy, tankId, tankName, product, opening, received, sold, expected (op+rv-sl), actual (dip reading), discrepancy (actual-expected), branchId.

## Where it's computed
Inside `approveDip` in AppContext.tsx — tank state is snapshotted **before** op/rv/sl are reset. The log entries are stored in `inventoryLog` state, persisted under AsyncStorage key `'inventoryLog'`, synced to the API server.

## Discrepancy threshold
50 litres (absolute). If |discrepancy| > 50L, chat-style `type:'alert'` messages are sent via `chatKey('admin', role)` to roles: md, ceo, acc, csm.

## NOT reset on production reset
`inventoryLog` is intentionally excluded from `resetOperationalData`. User requirement: keep full history.

## UI surface
Fourth tab ("History") in `app/(app)/tanks.tsx`. Cards show opening/received/sold/expected/actual/discrepancy. Shortage cards have red border; overage cards have amber border.

**Why:**
User needed a permanent audit trail of tank level reconciliation; discrepancies alert finance/management roles immediately via the existing chat notification channel.
