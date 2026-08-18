---
name: Report export web print
description: Expo Print behaves differently in browser previews versus native builds.
---

On web, `expo-print` opens the browser print dialog through `printAsync({ html })`; `printToFileAsync({ html })` also opens printing but does not return a native file URI, so it must not be destructured and passed to `expo-sharing`.

**Why:** The browser implementation returns no PDF file object, which caused report exports to fail at runtime when code expected `{ uri }`.

**How to apply:** Use the web print path for browser previews and reserve `printToFileAsync` followed by `expo-sharing` for native platforms.