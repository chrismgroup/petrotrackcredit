---
name: Database acceptance test lifecycle
description: Shared database-backed acceptance tests must coordinate module-level pool ownership.
---

Database acceptance tests that import the same module-level PostgreSQL pool must not close that pool from an early test; keep teardown with the final test or a shared suite hook.

**Why:** Node's test runner can reuse the cached database module across tests, so an early `pool.end()` makes later tests fail before their setup even begins.

**How to apply:** When adding database-backed cases to an existing acceptance file, preserve one pool lifecycle for the whole file and serialize tests when they mutate shared fixture state.