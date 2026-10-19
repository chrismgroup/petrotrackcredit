import express, { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import {
  FileStore,
  MAX_UPLOAD_BYTES,
  contentDisposition,
  decodeHeaderFileName,
  normalizeCategory,
  normalizeRelatedId,
} from "../lib/fileStore";

const router: IRouter = Router();
const fileStore = new FileStore();
const FILE_MANAGEMENT_ROLES = new Set(["admin", "acc", "mktg", "csm", "md", "ceo"]);

const rawUploadBody = express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES });

function readUploadBody(req: Request, res: Response, next: NextFunction) {
  rawUploadBody(req, res, (error?: unknown) => {
    if (!error) {
      next();
      return;
    }
    const type = (error as { type?: string }).type;
    if (type === "entity.too.large") {
      res.status(413).json({ error: `File is larger than ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.` });
      return;
    }
    res.status(400).json({ error: "The file could not be read. Please try again." });
  });
}

function wildcardObjectPath(raw: string | string[] | undefined): string {
  const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw ?? "";
  return `/objects/${wildcardPath}`;
}

/**
 * POST /storage/uploads
 *
 * Upload a file through the API. The raw file bytes are the request body
 * (sent as application/octet-stream); the original name and type travel in
 * X-File-Name (URI-encoded) and X-File-Type. X-File-Category and
 * X-Related-Id link the file to the app record it belongs to. Files are
 * stored in PostgreSQL.
 */
router.post("/storage/uploads", requireAuth, readUploadBody, async (req: Request, res: Response) => {
  const data = Buffer.isBuffer(req.body) ? req.body : null;
  if (!data || data.length === 0) {
    res.status(400).json({ error: "The selected file is empty." });
    return;
  }

  const headerType = req.get("x-file-type");
  const contentType = headerType && headerType.trim() ? headerType.trim().slice(0, 200) : "application/octet-stream";

  try {
    const stored = await fileStore.save({
      name: decodeHeaderFileName(req.headers["x-file-name"]),
      contentType,
      data,
      uploadedBy: req.auth?.username ?? null,
      category: normalizeCategory(req.get("x-file-category")),
      relatedId: normalizeRelatedId(req.get("x-related-id")),
      branchId: req.auth?.branchId ?? null,
    });
    res.status(201).json(stored);
  } catch (error) {
    req.log.error({ err: error }, "Error saving uploaded file");
    res.status(500).json({ error: "The server could not save the file. Please try again." });
  }
});

/**
 * DELETE /storage/objects/*
 *
 * Remove a private uploaded object after its owning metadata has been
 * removed or replaced. Users who manage corporate folders may delete any
 * file; everyone else may only delete files they uploaded.
 */
router.delete("/storage/objects/*path", requireAuth, async (req: Request, res: Response) => {
  const objectPath = wildcardObjectPath(req.params.path);
  try {
    const canManage = !!req.auth?.role && FILE_MANAGEMENT_ROLES.has(req.auth.role);
    if (!canManage) {
      const meta = await fileStore.getMeta(objectPath);
      if (!meta || !req.auth?.username || meta.uploadedBy !== req.auth.username) {
        res.status(403).json({ error: "You do not have permission to manage folder files" });
        return;
      }
    }
    // Deletion is idempotent when metadata outlives an already-removed file.
    await fileStore.delete(objectPath);
    res.status(204).end();
  } catch (error) {
    req.log.error({ err: error }, "Error deleting object");
    res.status(500).json({ error: "Failed to delete object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve an uploaded file from PostgreSQL to signed-in users.
 */
router.get("/storage/objects/*path", requireAuth, async (req: Request, res: Response) => {
  const objectPath = wildcardObjectPath(req.params.path);
  try {
    const stored = await fileStore.get(objectPath);
    if (stored) {
      res.status(200);
      res.setHeader("Content-Type", stored.contentType);
      res.setHeader("Content-Length", String(stored.data.length));
      res.setHeader("Content-Disposition", contentDisposition(stored.name));
      // Files are never cached on devices; the database is the only copy.
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
      res.end(stored.data);
      return;
    }
    res.status(404).json({ error: "Object not found" });
  } catch (error) {
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
