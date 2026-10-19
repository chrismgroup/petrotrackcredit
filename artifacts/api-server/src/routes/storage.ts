import express, { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { Readable } from "stream";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { requireAuth } from "../middlewares/requireAuth";
import {
  FileStore,
  MAX_UPLOAD_BYTES,
  contentDisposition,
  decodeHeaderFileName,
} from "../lib/fileStore";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
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
 * X-File-Name (URI-encoded) and X-File-Type. Files are stored in PostgreSQL.
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
    });
    res.status(201).json(stored);
  } catch (error) {
    req.log.error({ err: error }, "Error saving uploaded file");
    res.status(500).json({ error: "The server could not save the file. Please try again." });
  }
});

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 */
router.post("/storage/uploads/request-url", requireAuth, async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const { name, size, contentType } = parsed.data;

    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * DELETE /storage/objects/*
 *
 * Remove a private uploaded object after its owning metadata has been
 * removed or replaced. Only users who can manage corporate folders may do so.
 */
router.delete("/storage/objects/*path", requireAuth, async (req: Request, res: Response) => {
  if (!req.auth?.role || !FILE_MANAGEMENT_ROLES.has(req.auth.role)) {
    res.status(403).json({ error: "You do not have permission to manage folder files" });
    return;
  }

  const objectPath = wildcardObjectPath(req.params.path);
  try {
    if (await fileStore.delete(objectPath)) {
      res.status(204).end();
      return;
    }
    if (!process.env.PRIVATE_OBJECT_DIR) {
      res.status(204).end();
      return;
    }
    await objectStorageService.deleteObjectEntity(objectPath);
    res.status(204).end();
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      // Deletion is idempotent when metadata outlives an already-removed object.
      res.status(204).end();
      return;
    }
    req.log.error({ err: error }, "Error deleting object");
    res.status(500).json({ error: "Failed to delete object" });
  }
});

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
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
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
      res.end(stored.data);
      return;
    }
    if (!process.env.PRIVATE_OBJECT_DIR) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
