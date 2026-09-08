---
name: Admin-controlled page access
description: Role defaults and authoritative per-user overrides for every authenticated app route
---

Existing role defaults remain the baseline. Admin may override any page for an individual user; the individual override takes priority over the role default. A denied page must be absent from navigation and Home links and blocked at the route boundary.

Unknown authenticated routes fail closed. Admin itself retains access to all pages, and only Admin may persist access-control changes.

**Why:** Module lists, primary tabs, Home cards, and deep links previously used different permission rules, leaving some denied screens visible or directly reachable.

**How to apply:** Add every new authenticated route to the shared route-to-permission policy and to the Admin access catalog. Reuse the shared access decision for tabs, jobs, Home links, notifications, and deep links.