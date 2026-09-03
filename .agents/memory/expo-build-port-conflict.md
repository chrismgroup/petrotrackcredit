---
name: Expo build port conflict
description: The standalone Petrotrack build must isolate its Metro port from managed preview workflows.
---

The standalone Petrotrack static build must allocate its own available Metro port, or use an explicitly supplied `METRO_PORT`, and pass that same port to every Metro request.

**Why:** Managed previews reserve fixed ports, including the mockup sandbox on 8081 and Expo on 26086. Assuming Metro's default port makes full builds prompt or stall when previews are open.

**How to apply:** Keep preview workflows on their artifact-managed ports. New status, manifest, bundle, or asset requests in the static build must use the one selected build port rather than a hardcoded default.