---
name: Backup acceptance storage
description: How to keep bundled API backup and restore acceptance tests transport-independent.
---

Backup and restore acceptance coverage should replace the object-storage bucket with an in-memory file map while keeping the HTTP backup and restore routes real.

**Why:** The bundled Google Cloud Storage transport can reject Node's native `AbortSignal` instance before the backup logic runs, making the acceptance result depend on the bundler/runtime combination rather than the application.

**How to apply:** Preserve the configured private-object directory for path parsing, patch only the storage client's bucket/file methods inside the test, and restore the original bucket method in cleanup.