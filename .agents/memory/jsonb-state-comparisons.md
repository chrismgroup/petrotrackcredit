---
name: JSONB state comparisons
description: Comparison constraint for records round-tripped through PostgreSQL JSONB
---

When deciding whether a client state record is unchanged after a database read, use structural comparison rather than `JSON.stringify`; PostgreSQL JSONB can return object keys in a different order from the request body.

**Why:** Serialization-order differences can misclassify an unchanged record as a mutation, causing a valid full-array sync to be rejected before the server merge can preserve newer records.

**How to apply:** Use a key-order-independent equality check for authorization/idempotency guards around JSONB-backed state. Keep merge selection and transition authorization separate so only candidates the merge would discard bypass mutation checks.