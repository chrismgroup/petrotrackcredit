---
name: Startup health readiness
description: API deployment healthchecks must be served before database seeding or migrations complete.
---

The API should bind its port and serve its database-independent health endpoint before running startup seeding/migration work. Database initialization can continue after the server is listening.

**Why:** Deployment healthchecks probe immediately after the process starts; waiting for database work caused transient 500s and made otherwise healthy deployments fail readiness.

**How to apply:** Keep `/api/healthz` free of database dependencies, start `app.listen` first, and run user/data initialization asynchronously with explicit error logging.