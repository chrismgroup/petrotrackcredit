---
name: My Folder shared storage
description: Shared folder creation and unrestricted file upload behavior for the My Folder dashboard.
---

My Folder is a shared workspace with sensitive corporate sections—including Compliance, Legal Documents, Minutes of Meetings, Projects and Correspondences—and a General Library section. General Library is visible to every signed-in user and is intended for company handbooks, standard operating procedures, safety manuals and similar resources. Approved corporate users, including administrators, may create subfolders beneath their visible sections and upload files of any type into either the main section or a subfolder. Folder and file metadata is synchronized through shared app state; the API merges folder/file arrays by ID rather than replacing them, and file deletions use tombstones so stale clients cannot erase or resurrect records. Uploaded bytes use private object storage and require the Petrotrack JWT for upload URL generation and download.

**Why:** Company-wide reference materials must be available to all staff, while sensitive corporate records retain their existing role gate.

**How to apply:** Keep General Library visible for any signed-in role, preserve the approved-role gate for the other sections, use `type: '*/*'` for device picking, store the returned object path with synchronized metadata, keep private storage endpoints authenticated, and use an authenticated browser blob path for web download/preview/share actions.

Certificates and documents may carry an optional expiry date. The server evaluates expiring files on startup and daily, creates a durable reminder when they enter the three-calendar-month window, and preserves an expiry-notified marker with the shared metadata.

**Why:** A reminder cannot depend on a staff member opening My Folder at the right time, and sensitive document names or expiry details must not leak to staff who cannot view that folder section.

**How to apply:** Send General Library expiry reminders to all active staff, but send restricted-section reminders only to approved corporate roles. Treat the authenticated inbox as the delivery guarantee; native push is a best-effort supplement. Serialize the reminder worker and normal shared-file writes with the same lock so no stale client or scheduler write can erase a file or re-send a reminder.

The Home dashboard classifies tracked files as red when expired, yellow when they expire within 90 days, and green when they have more than 90 days remaining. Each dashboard row deep-links with the file ID and section so My Folder can select the matching subfolder and highlight the exact document.

**Why:** Expiry status needs to be scannable before users open My Folder, while a status summary is only useful if it leads directly to the record needing attention.

**How to apply:** Keep the dashboard and My Folder status thresholds aligned at 90 days, exclude files without expiry dates from the dashboard summary, and preserve section/file parameters when changing the Folder navigation.

**Why:** Every device sends its complete local metadata array. Last-writer-wins replacement made an older device overwrite a newly uploaded document before other users could see it.

**How to apply:** Any new shared metadata array needs server-side ID-based merging (or an explicit operation API); never restore whole-array replacement for My Folder. Keep deleted file tombstones hidden in the UI while retaining them for conflict resolution.

File replacement should upload the new object before deleting the old object; destructive object deletion must be authenticated and role-checked on the server, not controlled by a client-provided folder scope.

**Why:** A failed replacement must not destroy the current document, and client-supplied scope values are not a trustworthy authorization boundary.

**How to apply:** Keep metadata and object cleanup coordinated through the authenticated storage API; remove old metadata only after the replacement upload and object deletion succeed.