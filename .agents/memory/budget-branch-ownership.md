---
name: Budget branch ownership
description: Branch identity and manager visibility rules for budgets.
---

Every new budget must carry both a valid branch ID and its canonical branch name. A station manager’s authenticated branch is authoritative; client input cannot move that manager’s budget to another branch. Network finance reviewers may select a branch when creating a budget.

**Why:** Budgets without branch identity were treated as global records, making it possible for branch-specific finance data to appear outside its intended station.

**How to apply:** Scope manager budget reads and approved-budget selectors by authenticated branch on both the API and mobile client. Resolve legacy manager budgets from the submitting staff account’s current branch, but never guess a branch when ownership is ambiguous.