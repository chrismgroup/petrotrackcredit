---
name: Asset access policy
description: Durable role and branch-scope rules for company asset management
---

The company asset role policy must have one shared source consumed by both the API and mobile app. Corporate roles manage assets across all branches; branch-scoped roles can only manage assets assigned to their authenticated branch.

**Why:** The same authorization rule appears in server enforcement, local mutation guards, and screen controls. Separate role lists can drift and either hide valid controls or weaken server enforcement.

**How to apply:** When changing asset-management roles, update the shared policy first and keep the API, AppContext, and Asset Management screen on its helpers rather than adding local role comparisons.