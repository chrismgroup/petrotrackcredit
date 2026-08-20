---
name: My Folder shared storage
description: Shared folder creation and unrestricted file upload behavior for the My Folder dashboard.
---

My Folder is a shared workspace with sensitive corporate sections—including Compliance, Legal Documents, Minutes of Meetings, Projects and Correspondences—and a General Library section. General Library is visible to every signed-in user and is intended for company handbooks, standard operating procedures, safety manuals and similar resources. Approved corporate users, including administrators, may create subfolders beneath their visible sections and upload files of any type into either the main section or a subfolder. Folder and file metadata is synchronized through shared app state; the API merges folder/file arrays by ID rather than replacing them, and file deletions use tombstones so stale clients cannot erase or resurrect records. Uploaded bytes use private object storage and require the Petrotrack JWT for upload URL generation and download.

**Why:** Company-wide reference materials must be available to all staff, while sensitive corporate records retain their existing role gate.

**How to apply:** Keep General Library visible for any signed-in role, preserve the approved-role gate for the other sections, use `type: '*/*'` for device picking, store the returned object path with synchronized metadata, keep private storage endpoints authenticated, and use an authenticated browser blob path for web download/preview/share actions.

**Why:** Every device sends its complete local metadata array. Last-writer-wins replacement made an older device overwrite a newly uploaded document before other users could see it.

**How to apply:** Any new shared metadata array needs server-side ID-based merging (or an explicit operation API); never restore whole-array replacement for My Folder. Keep deleted file tombstones hidden in the UI while retaining them for conflict resolution.

File replacement should upload the new object before deleting the old object; destructive object deletion must be authenticated and role-checked on the server, not controlled by a client-provided folder scope.

**Why:** A failed replacement must not destroy the current document, and client-supplied scope values are not a trustworthy authorization boundary.

**How to apply:** Keep metadata and object cleanup coordinated through the authenticated storage API; remove old metadata only after the replacement upload and object deletion succeed.