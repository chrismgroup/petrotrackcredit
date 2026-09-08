---
name: Native form confirmations
description: Prevent hidden or delayed confirmation steps in modal-based mobile forms.
---

When a React Native form is already presented in a native `Modal`, render its confirmation step within that same modal instead of opening another native modal on top.

**Why:** Nested native modals can leave the second modal hidden until the first one closes. This makes the primary action appear unresponsive and can require users to tap repeatedly or cancel the form before seeing the confirmation.

**How to apply:** For full-screen modal forms, switch the modal’s body between the editor and an embedded confirmation state. Reserve standalone modal confirmations for screens that are not already inside a native modal.