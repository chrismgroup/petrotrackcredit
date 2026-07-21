import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;

export interface VesselAuthPayload {
  userId: number;
  email: string;
  role: string;
  scope: string;
}

declare global {
  namespace Express {
    interface Request {
      vesselAuth?: VesselAuthPayload;
    }
  }
}

export function requireVesselAuth(req: Request, res: Response, next: NextFunction): void {
  if (!JWT_SECRET) {
    req.log.error("JWT_SECRET environment variable is not set");
    res.status(503).json({ error: "Service unavailable" });
    return;
  }

  const header = req.headers["authorization"];
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as VesselAuthPayload;
    if (payload.scope !== "vessel") {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    req.vesselAuth = payload;
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}

export function optionalVesselAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!JWT_SECRET) { next(); return; }
  const header = req.headers["authorization"];
  if (!header || !header.startsWith("Bearer ")) { next(); return; }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as VesselAuthPayload;
    if (payload.scope === "vessel") req.vesselAuth = payload;
  } catch { /* ignore */ }
  next();
}

export function requireVesselRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.vesselAuth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!roles.includes(req.vesselAuth.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}
