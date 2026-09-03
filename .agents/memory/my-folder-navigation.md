---
name: My Folder navigation
description: Navigation boundaries and deep-link rules for the My Documents workspace and file preview experience
---

My Documents has three navigation layers: the area chooser, a dedicated workspace page, and a dedicated file-preview page. The workspace owns folder selection and file management; the preview page owns retrieval and file actions.

**Why:** Keeping the workspace and file preview on separate pages makes browser/native back navigation predictable and avoids nesting storage-heavy preview behavior inside the area chooser.

**How to apply:** Preserve the document `section` when entering a workspace and preserve both `section` and `fileId` when entering a preview. Keep the existing protected-storage and role checks on both routes.