import bcrypt from "bcryptjs";
import { and, asc, eq, inArray } from "drizzle-orm";
import { Router, type IRouter } from "express";
import jwt from "jsonwebtoken";

import {
  db,
  vesselUsersTable,
  vesselsTable,
  vesselContactsTable,
  charterPartiesTable,
  vesselNotificationsTable,
  vesselPhotosTable,
} from "@workspace/db";
import {
  requireVesselAuth,
  optionalVesselAuth,
  requireVesselRole,
} from "../middlewares/requireVesselAuth";
import { expireHires } from "../lib/expireHires";

const pId = (p: string | string[]): number =>
  parseInt(Array.isArray(p) ? p[0] : p, 10);

const CURRENT_YEAR = new Date().getFullYear();

function validateIMONumber(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  const s = String(value).trim();
  if (!/^\d{7}$/.test(s)) return "IMO number must be exactly 7 digits";
  const digits = s.split("").map(Number);
  const weights = [7, 6, 5, 4, 3, 2];
  const sum = digits.slice(0, 6).reduce((acc, d, i) => acc + d * weights[i], 0);
  if ((sum % 10) !== digits[6]) return "IMO number has an invalid check digit";
  return null;
}

function validatePositiveDecimal(value: unknown, label: string, min: number, max: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  const num = Number(value);
  if (isNaN(num) || !isFinite(num)) return `${label} must be a number`;
  if (num <= 0) return `${label} must be greater than 0`;
  if (num < min) return `${label} must be at least ${min}`;
  if (num > max) return `${label} must be at most ${max.toLocaleString()}`;
  return null;
}

function validateYearBuilt(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  const num = Number(value);
  if (!Number.isInteger(num) || isNaN(num)) return "Year built must be a whole number";
  if (num < 1900) return "Year built must be 1900 or later";
  if (num > CURRENT_YEAR + 1) return "Year built cannot be in the future";
  return null;
}

interface VesselFieldsInput {
  imoNumber?: unknown;
  dwt?: unknown;
  grt?: unknown;
  yearBuilt?: unknown;
  loa?: unknown;
  beam?: unknown;
  draft?: unknown;
}

function validateVesselFields(fields: VesselFieldsInput): Record<string, string> {
  const errors: Record<string, string> = {};
  const checks: [string | null, string][] = [
    [validateIMONumber(fields.imoNumber), "imoNumber"],
    [validatePositiveDecimal(fields.dwt, "DWT", 1, 500_000), "dwt"],
    [validatePositiveDecimal(fields.grt, "GRT", 1, 300_000), "grt"],
    [validateYearBuilt(fields.yearBuilt), "yearBuilt"],
    [validatePositiveDecimal(fields.loa, "LOA", 1, 500), "loa"],
    [validatePositiveDecimal(fields.beam, "Beam", 1, 100), "beam"],
    [validatePositiveDecimal(fields.draft, "Draft", 0.1, 30), "draft"],
  ];
  for (const [msg, field] of checks) {
    if (msg) errors[field] = msg;
  }
  return errors;
}

const router: IRouter = Router();
const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_TTL = "24h";
const BCRYPT_ROUNDS = 12;

function safeUser(u: typeof vesselUsersTable.$inferSelect) {
  const { password: _, ...rest } = u;
  return rest;
}

function signToken(user: typeof vesselUsersTable.$inferSelect): string {
  if (!JWT_SECRET) throw new Error("JWT_SECRET not set");
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role, scope: "vessel" },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL },
  );
}

async function createNotification(
  userId: number,
  type: string,
  title: string,
  message: string,
  relatedId?: number,
) {
  try {
    await db.insert(vesselNotificationsTable).values({
      userId, type, title, message, relatedId: relatedId ?? null,
    });
  } catch { /* non-critical */ }
}

// ── AUTH ──────────────────────────────────────────────────────────────────────

router.post("/vessels/auth/register", async (req, res): Promise<void> => {
  if (!JWT_SECRET) { res.status(503).json({ error: "Service unavailable" }); return; }
  const { name, email, password, role, company, phone } = req.body ?? {};
  if (!name || !email || !password) {
    res.status(400).json({ error: "name, email, and password are required" }); return;
  }
  if (String(password).length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" }); return;
  }
  const allowedRoles = ["client", "broker", "owner"];
  const resolvedRole = allowedRoles.includes(role) ? role : "client";

  try {
    const [existing] = await db
      .select({ id: vesselUsersTable.id })
      .from(vesselUsersTable)
      .where(eq(vesselUsersTable.email, String(email).toLowerCase().trim()));
    if (existing) { res.status(409).json({ error: "Email already registered" }); return; }

    const hashed = await bcrypt.hash(String(password), BCRYPT_ROUNDS);
    const [user] = await db.insert(vesselUsersTable).values({
      name: String(name).trim(),
      email: String(email).toLowerCase().trim(),
      password: hashed,
      role: resolvedRole,
      company: company ?? null,
      phone: phone ?? null,
    }).returning();

    const token = signToken(user);
    res.status(201).json({ token, user: safeUser(user) });
  } catch (err: any) {
    if (err?.code === "23505") { res.status(409).json({ error: "Email already registered" }); return; }
    throw err;
  }
});

router.post("/vessels/auth/login", async (req, res): Promise<void> => {
  if (!JWT_SECRET) { res.status(503).json({ error: "Service unavailable" }); return; }
  const { email, password } = req.body ?? {};
  if (!email || !password) { res.status(400).json({ error: "email and password required" }); return; }

  const [user] = await db.select().from(vesselUsersTable)
    .where(eq(vesselUsersTable.email, String(email).toLowerCase().trim()));

  if (!user) {
    // Dummy hash comparison to prevent timing attacks
    await bcrypt.compare("dummy", "$2a$12$dummy.hash.to.prevent.timing.attacks");
    res.status(401).json({ error: "Invalid credentials" }); return;
  }

  const valid = await bcrypt.compare(String(password), user.password);
  if (!valid) { res.status(401).json({ error: "Invalid credentials" }); return; }

  const token = signToken(user);
  res.json({ token, user: safeUser(user) });
});

// ── VESSELS ───────────────────────────────────────────────────────────────────

router.get("/vessels", optionalVesselAuth, async (req, res): Promise<void> => {
  await expireHires();
  const { vesselType, status, tradingArea, search } = req.query as Record<string, string>;

  const rows = await db.select({
    id: vesselsTable.id,
    ownerId: vesselsTable.ownerId,
    name: vesselsTable.name,
    imoNumber: vesselsTable.imoNumber,
    vesselType: vesselsTable.vesselType,
    flag: vesselsTable.flag,
    dwt: vesselsTable.dwt,
    grt: vesselsTable.grt,
    yearBuilt: vesselsTable.yearBuilt,
    loa: vesselsTable.loa,
    beam: vesselsTable.beam,
    draft: vesselsTable.draft,
    classificationSociety: vesselsTable.classificationSociety,
    tradingArea: vesselsTable.tradingArea,
    description: vesselsTable.description,
    status: vesselsTable.status,
    createdAt: vesselsTable.createdAt,
    updatedAt: vesselsTable.updatedAt,
    ownerName: vesselUsersTable.name,
  }).from(vesselsTable).leftJoin(vesselUsersTable, eq(vesselsTable.ownerId, vesselUsersTable.id));

  let result = rows as typeof rows;
  if (vesselType && vesselType !== "All") result = result.filter(v => v.vesselType === vesselType);
  if (status && status !== "All") result = result.filter(v => v.status === status);
  if (tradingArea) result = result.filter(v => v.tradingArea?.toLowerCase().includes(tradingArea.toLowerCase()));
  if (search) {
    const s = search.toLowerCase();
    result = result.filter(v =>
      v.name.toLowerCase().includes(s) ||
      v.imoNumber?.toLowerCase().includes(s) ||
      v.vesselType.toLowerCase().includes(s) ||
      v.flag?.toLowerCase().includes(s)
    );
  }

  const vesselIds = result.map(v => v.id);
  const firstPhotos = vesselIds.length > 0
    ? await db
        .select({ vesselId: vesselPhotosTable.vesselId, objectPath: vesselPhotosTable.objectPath })
        .from(vesselPhotosTable)
        .where(inArray(vesselPhotosTable.vesselId, vesselIds))
        .orderBy(asc(vesselPhotosTable.sortOrder), asc(vesselPhotosTable.uploadedAt))
    : [];
  const firstPhotoMap = new Map<number, string>();
  for (const p of firstPhotos) {
    if (!firstPhotoMap.has(p.vesselId)) firstPhotoMap.set(p.vesselId, p.objectPath);
  }

  res.json(result.map(v => ({ ...v, firstPhotoPath: firstPhotoMap.get(v.id) ?? null })));
});

router.get("/vessels/:id", optionalVesselAuth, async (req, res): Promise<void> => {
  await expireHires();
  const id = pId(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [vessel] = await db.select({
    id: vesselsTable.id,
    ownerId: vesselsTable.ownerId,
    name: vesselsTable.name,
    imoNumber: vesselsTable.imoNumber,
    vesselType: vesselsTable.vesselType,
    flag: vesselsTable.flag,
    dwt: vesselsTable.dwt,
    grt: vesselsTable.grt,
    yearBuilt: vesselsTable.yearBuilt,
    loa: vesselsTable.loa,
    beam: vesselsTable.beam,
    draft: vesselsTable.draft,
    classificationSociety: vesselsTable.classificationSociety,
    tradingArea: vesselsTable.tradingArea,
    description: vesselsTable.description,
    status: vesselsTable.status,
    createdAt: vesselsTable.createdAt,
    updatedAt: vesselsTable.updatedAt,
    ownerName: vesselUsersTable.name,
  }).from(vesselsTable)
    .leftJoin(vesselUsersTable, eq(vesselsTable.ownerId, vesselUsersTable.id))
    .where(eq(vesselsTable.id, id));

  if (!vessel) { res.status(404).json({ error: "Vessel not found" }); return; }

  let contacts: typeof vesselContactsTable.$inferSelect[] = [];
  if (req.vesselAuth) {
    contacts = await db.select().from(vesselContactsTable).where(eq(vesselContactsTable.vesselId, id));
  }

  const photos = await db
    .select()
    .from(vesselPhotosTable)
    .where(eq(vesselPhotosTable.vesselId, id))
    .orderBy(vesselPhotosTable.sortOrder, vesselPhotosTable.uploadedAt);

  res.json({ ...vessel, contacts, photos });
});

router.post("/vessels", requireVesselAuth, requireVesselRole(["owner", "admin"]), async (req, res): Promise<void> => {
  const { name, imoNumber, vesselType, flag, dwt, grt, yearBuilt, loa, beam, draft,
    classificationSociety, tradingArea, description, status, contacts } = req.body ?? {};

  if (!name || !vesselType) { res.status(400).json({ error: "name and vesselType are required" }); return; }

  const fieldErrors = validateVesselFields({ imoNumber, dwt, grt, yearBuilt, loa, beam, draft });
  if (Object.keys(fieldErrors).length > 0) {
    res.status(400).json({ error: "Validation failed", fields: fieldErrors }); return;
  }

  const [vessel] = await db.insert(vesselsTable).values({
    ownerId: req.vesselAuth!.userId,
    name: String(name).trim(),
    imoNumber: imoNumber ?? null,
    vesselType: String(vesselType),
    flag: flag ?? null,
    dwt: dwt ? String(dwt) : null,
    grt: grt ? String(grt) : null,
    yearBuilt: yearBuilt ? parseInt(yearBuilt) : null,
    loa: loa ? String(loa) : null,
    beam: beam ? String(beam) : null,
    draft: draft ? String(draft) : null,
    classificationSociety: classificationSociety ?? null,
    tradingArea: tradingArea ?? null,
    description: description ?? null,
    status: status ?? "available",
  }).returning();

  if (contacts && Array.isArray(contacts) && contacts.length > 0) {
    await db.insert(vesselContactsTable).values(
      contacts.map((c: any) => ({
        vesselId: vessel.id,
        contactName: String(c.contactName || "Contact").trim(),
        phone: c.phone ?? null,
        email: c.email ?? null,
        address: c.address ?? null,
      }))
    );
  }

  res.status(201).json(vessel);
});

router.put("/vessels/:id", requireVesselAuth, async (req, res): Promise<void> => {
  const id = pId(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(vesselsTable).where(eq(vesselsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Vessel not found" }); return; }

  const auth = req.vesselAuth!;
  if (auth.role !== "admin" && existing.ownerId !== auth.userId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const { name, imoNumber, vesselType, flag, dwt, grt, yearBuilt, loa, beam, draft,
    classificationSociety, tradingArea, description, contacts } = req.body ?? {};

  const fieldErrors = validateVesselFields({ imoNumber, dwt, grt, yearBuilt, loa, beam, draft });
  if (Object.keys(fieldErrors).length > 0) {
    res.status(400).json({ error: "Validation failed", fields: fieldErrors }); return;
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) updates.name = name;
  if (imoNumber !== undefined) updates.imoNumber = imoNumber;
  if (vesselType !== undefined) updates.vesselType = vesselType;
  if (flag !== undefined) updates.flag = flag;
  if (dwt !== undefined) updates.dwt = dwt ? String(dwt) : null;
  if (grt !== undefined) updates.grt = grt ? String(grt) : null;
  if (yearBuilt !== undefined) updates.yearBuilt = yearBuilt ? parseInt(yearBuilt) : null;
  if (loa !== undefined) updates.loa = loa ? String(loa) : null;
  if (beam !== undefined) updates.beam = beam ? String(beam) : null;
  if (draft !== undefined) updates.draft = draft ? String(draft) : null;
  if (classificationSociety !== undefined) updates.classificationSociety = classificationSociety;
  if (tradingArea !== undefined) updates.tradingArea = tradingArea;
  if (description !== undefined) updates.description = description;

  const [updated] = await db.update(vesselsTable).set(updates).where(eq(vesselsTable.id, id)).returning();

  if (contacts && Array.isArray(contacts)) {
    await db.delete(vesselContactsTable).where(eq(vesselContactsTable.vesselId, id));
    if (contacts.length > 0) {
      await db.insert(vesselContactsTable).values(
        contacts.map((c: any) => ({
          vesselId: id,
          contactName: String(c.contactName || "Contact").trim(),
          phone: c.phone ?? null,
          email: c.email ?? null,
          address: c.address ?? null,
        }))
      );
    }
  }

  res.json(updated);
});

router.patch("/vessels/:id/status", requireVesselAuth, async (req, res): Promise<void> => {
  const id = pId(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(vesselsTable).where(eq(vesselsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Vessel not found" }); return; }

  const auth = req.vesselAuth!;
  if (auth.role !== "admin" && existing.ownerId !== auth.userId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const { status } = req.body ?? {};
  const allowed = ["available", "laid_up", "decommissioned"];
  if (!allowed.includes(status)) {
    res.status(400).json({ error: `status must be one of: ${allowed.join(", ")}` }); return;
  }
  if (existing.status === "on_hire") {
    res.status(400).json({ error: "Cannot change status of a vessel that is currently on hire" }); return;
  }

  const [updated] = await db.update(vesselsTable).set({ status, updatedAt: new Date() }).where(eq(vesselsTable.id, id)).returning();
  res.json(updated);
});

router.get("/vessels/:id/contacts", requireVesselAuth, async (req, res): Promise<void> => {
  const id = pId(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const contacts = await db.select().from(vesselContactsTable).where(eq(vesselContactsTable.vesselId, id));
  res.json(contacts);
});

// ── VESSEL PHOTOS ──────────────────────────────────────────────────────────────

router.get("/vessels/:id/photos", async (req, res): Promise<void> => {
  const id = pId(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const photos = await db
    .select()
    .from(vesselPhotosTable)
    .where(eq(vesselPhotosTable.vesselId, id))
    .orderBy(asc(vesselPhotosTable.sortOrder), asc(vesselPhotosTable.uploadedAt));
  res.json(photos);
});

router.post("/vessels/:id/photos", requireVesselAuth, async (req, res): Promise<void> => {
  const id = pId(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [vessel] = await db.select().from(vesselsTable).where(eq(vesselsTable.id, id));
  if (!vessel) { res.status(404).json({ error: "Vessel not found" }); return; }

  const auth = req.vesselAuth!;
  if (auth.role !== "admin" && vessel.ownerId !== auth.userId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const { objectPath } = req.body ?? {};
  if (!objectPath || typeof objectPath !== "string") {
    res.status(400).json({ error: "objectPath is required" }); return;
  }

  const existing = await db
    .select({ id: vesselPhotosTable.id })
    .from(vesselPhotosTable)
    .where(eq(vesselPhotosTable.vesselId, id));
  if (existing.length >= 5) {
    res.status(400).json({ error: "Maximum 5 photos per vessel" }); return;
  }

  const [photo] = await db.insert(vesselPhotosTable).values({
    vesselId: id,
    objectPath: String(objectPath),
    sortOrder: existing.length,
  }).returning();

  res.status(201).json(photo);
});

router.delete("/vessels/:id/photos/:photoId", requireVesselAuth, async (req, res): Promise<void> => {
  const id = pId(req.params.id);
  const photoId = pId(req.params.photoId);
  if (Number.isNaN(id) || Number.isNaN(photoId)) {
    res.status(400).json({ error: "Invalid id" }); return;
  }

  const [vessel] = await db.select().from(vesselsTable).where(eq(vesselsTable.id, id));
  if (!vessel) { res.status(404).json({ error: "Vessel not found" }); return; }

  const auth = req.vesselAuth!;
  if (auth.role !== "admin" && vessel.ownerId !== auth.userId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const [photo] = await db.select().from(vesselPhotosTable)
    .where(and(eq(vesselPhotosTable.id, photoId), eq(vesselPhotosTable.vesselId, id)));
  if (!photo) { res.status(404).json({ error: "Photo not found" }); return; }

  await db.delete(vesselPhotosTable)
    .where(and(eq(vesselPhotosTable.id, photoId), eq(vesselPhotosTable.vesselId, id)));

  res.status(204).end();
});

// ── CHARTER PARTIES ───────────────────────────────────────────────────────────

// Only clients and brokers (and admins) may submit charter enquiries — owners cannot
// charter their own or other's vessels through this flow
router.post("/vessels/:id/charter", requireVesselAuth, requireVesselRole(["client", "broker", "admin"]), async (req, res): Promise<void> => {
  const vesselId = pId(req.params.id);
  if (Number.isNaN(vesselId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [vessel] = await db.select().from(vesselsTable).where(eq(vesselsTable.id, vesselId));
  if (!vessel) { res.status(404).json({ error: "Vessel not found" }); return; }
  if (vessel.status !== "available") { res.status(400).json({ error: "Vessel is not available for charter" }); return; }

  const auth = req.vesselAuth!;
  // Extra guard: even an admin shouldn't charter their own vessel for a fair marketplace
  if (auth.userId === vessel.ownerId) {
    res.status(400).json({ error: "Owners cannot charter their own vessel" }); return;
  }

  const { rate, rateCurrency, rateBasis, laycanEarliest, laycanLatest, durationDays, cargoPurpose, terms } = req.body ?? {};

  const [cp] = await db.insert(charterPartiesTable).values({
    vesselId,
    chartererId: auth.userId,
    ownerId: vessel.ownerId,
    rate: rate ? String(rate) : null,
    rateCurrency: rateCurrency ?? "USD",
    rateBasis: rateBasis ?? null,
    laycanEarliest: laycanEarliest ? new Date(laycanEarliest) : null,
    laycanLatest: laycanLatest ? new Date(laycanLatest) : null,
    durationDays: durationDays ? parseInt(durationDays) : null,
    cargoPurpose: cargoPurpose ?? null,
    terms: terms ?? null,
    status: "enquiry",
  }).returning();

  await createNotification(
    vessel.ownerId,
    "enquiry_received",
    "New Charter Enquiry",
    `You have received a charter enquiry for ${vessel.name}`,
    cp.id,
  );

  res.status(201).json(cp);
});

async function enrichCharterParty(cp: typeof charterPartiesTable.$inferSelect & { vesselName?: string | null }) {
  const [charterer] = await db.select({ name: vesselUsersTable.name }).from(vesselUsersTable).where(eq(vesselUsersTable.id, cp.chartererId));
  const [owner] = await db.select({ name: vesselUsersTable.name }).from(vesselUsersTable).where(eq(vesselUsersTable.id, cp.ownerId));
  return { ...cp, chartererName: charterer?.name, ownerName: owner?.name };
}

router.get("/charter-parties", requireVesselAuth, async (req, res): Promise<void> => {
  await expireHires();
  const auth = req.vesselAuth!;

  const rows = await db
    .select({
      id: charterPartiesTable.id,
      vesselId: charterPartiesTable.vesselId,
      chartererId: charterPartiesTable.chartererId,
      ownerId: charterPartiesTable.ownerId,
      rate: charterPartiesTable.rate,
      rateCurrency: charterPartiesTable.rateCurrency,
      rateBasis: charterPartiesTable.rateBasis,
      laycanEarliest: charterPartiesTable.laycanEarliest,
      laycanLatest: charterPartiesTable.laycanLatest,
      durationDays: charterPartiesTable.durationDays,
      cargoPurpose: charterPartiesTable.cargoPurpose,
      terms: charterPartiesTable.terms,
      status: charterPartiesTable.status,
      ownerConfirmedAt: charterPartiesTable.ownerConfirmedAt,
      chartererConfirmedAt: charterPartiesTable.chartererConfirmedAt,
      hireStart: charterPartiesTable.hireStart,
      hireEnd: charterPartiesTable.hireEnd,
      createdAt: charterPartiesTable.createdAt,
      updatedAt: charterPartiesTable.updatedAt,
      vesselName: vesselsTable.name,
    })
    .from(charterPartiesTable)
    .leftJoin(vesselsTable, eq(charterPartiesTable.vesselId, vesselsTable.id));

  const filtered = auth.role === "admin"
    ? rows
    : rows.filter(cp => cp.chartererId === auth.userId || cp.ownerId === auth.userId);

  const enriched = await Promise.all(filtered.map(enrichCharterParty));
  res.json(enriched);
});

router.put("/charter-parties/:id", requireVesselAuth, async (req, res): Promise<void> => {
  const id = pId(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [cp] = await db.select().from(charterPartiesTable).where(eq(charterPartiesTable.id, id));
  if (!cp) { res.status(404).json({ error: "Charter party not found" }); return; }

  const auth = req.vesselAuth!;
  if (auth.userId !== cp.chartererId && auth.userId !== cp.ownerId && auth.role !== "admin") {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  if (!["enquiry", "negotiating"].includes(cp.status)) {
    res.status(400).json({ error: "Cannot edit a charter party in this state" }); return;
  }

  const { rate, rateCurrency, rateBasis, laycanEarliest, laycanLatest, durationDays, cargoPurpose, terms } = req.body ?? {};
  const updates: Record<string, unknown> = {
    status: "negotiating",
    updatedAt: new Date(),
    ownerConfirmedAt: null,
    chartererConfirmedAt: null,
  };
  if (rate !== undefined) updates.rate = rate ? String(rate) : null;
  if (rateCurrency !== undefined) updates.rateCurrency = rateCurrency;
  if (rateBasis !== undefined) updates.rateBasis = rateBasis;
  if (laycanEarliest !== undefined) updates.laycanEarliest = laycanEarliest ? new Date(laycanEarliest) : null;
  if (laycanLatest !== undefined) updates.laycanLatest = laycanLatest ? new Date(laycanLatest) : null;
  if (durationDays !== undefined) updates.durationDays = durationDays ? parseInt(durationDays) : null;
  if (cargoPurpose !== undefined) updates.cargoPurpose = cargoPurpose;
  if (terms !== undefined) updates.terms = terms;

  const [updated] = await db.update(charterPartiesTable).set(updates).where(eq(charterPartiesTable.id, id)).returning();

  const otherPartyId = auth.userId === cp.chartererId ? cp.ownerId : cp.chartererId;
  const [vessel] = await db.select({ name: vesselsTable.name }).from(vesselsTable).where(eq(vesselsTable.id, cp.vesselId));
  await createNotification(otherPartyId, "terms_updated", "Charter Terms Updated", `Terms were updated for ${vessel?.name ?? "vessel"} charter`, id);

  const enriched = await enrichCharterParty({ ...updated, vesselName: vessel?.name });
  res.json(enriched);
});

// Confirm: both parties must independently confirm; once both confirm the charter goes active
// Guard: no other active/confirmed charter may exist for the same vessel before activating
router.post("/charter-parties/:id/confirm", requireVesselAuth, async (req, res): Promise<void> => {
  const id = pId(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [cp] = await db.select().from(charterPartiesTable).where(eq(charterPartiesTable.id, id));
  if (!cp) { res.status(404).json({ error: "Charter party not found" }); return; }

  const auth = req.vesselAuth!;
  if (auth.userId !== cp.chartererId && auth.userId !== cp.ownerId && auth.role !== "admin") {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  if (!["enquiry", "negotiating"].includes(cp.status)) {
    res.status(400).json({ error: "Cannot confirm a charter party in this state" }); return;
  }

  const now = new Date();
  const isOwner = auth.role === "admin" || auth.userId === cp.ownerId;

  const updates: Record<string, unknown> = { updatedAt: now };
  if (isOwner) updates.ownerConfirmedAt = now;
  else updates.chartererConfirmedAt = now;

  const newOwnerConfirmed    = isOwner ? now : cp.ownerConfirmedAt;
  const newChartererConfirmed = isOwner ? cp.chartererConfirmedAt : now;

  if (newOwnerConfirmed && newChartererConfirmed) {
    // Guard: ensure no other active or confirmed charter already exists for this vessel
    const conflicting = await db
      .select({ id: charterPartiesTable.id })
      .from(charterPartiesTable)
      .where(and(
        eq(charterPartiesTable.vesselId, cp.vesselId),
        inArray(charterPartiesTable.status, ["active", "confirmed"]),
      ));
    const conflicts = conflicting.filter(c => c.id !== id);
    if (conflicts.length > 0) {
      res.status(409).json({ error: "Vessel already has an active or confirmed charter. Terminate it before confirming a new one." });
      return;
    }

    // Re-check vessel is still available
    const [vessel] = await db.select({ status: vesselsTable.status }).from(vesselsTable).where(eq(vesselsTable.id, cp.vesselId));
    if (vessel?.status === "on_hire") {
      res.status(409).json({ error: "Vessel is already on hire" });
      return;
    }

    updates.status = "active";
    updates.hireStart = now;
    if (cp.durationDays) {
      const end = new Date(now);
      end.setDate(end.getDate() + cp.durationDays);
      updates.hireEnd = end;
    }
    await db.update(vesselsTable).set({ status: "on_hire", updatedAt: now }).where(eq(vesselsTable.id, cp.vesselId));
  } else {
    updates.status = "negotiating";
  }

  const [updated] = await db.update(charterPartiesTable).set(updates).where(eq(charterPartiesTable.id, id)).returning();
  const [vesselRow] = await db.select({ name: vesselsTable.name }).from(vesselsTable).where(eq(vesselsTable.id, cp.vesselId));

  if (updates.status === "active") {
    await createNotification(cp.chartererId, "charter_active", "Charter Confirmed!", `Your charter for ${vesselRow?.name} is now active`, id);
    await createNotification(cp.ownerId, "charter_active", "Charter Confirmed!", `Charter for ${vesselRow?.name} is now active`, id);
  } else {
    const otherPartyId = isOwner ? cp.chartererId : cp.ownerId;
    await createNotification(otherPartyId, "party_confirmed", "Awaiting Your Confirmation", `Please confirm the charter for ${vesselRow?.name}`, id);
  }

  res.json(updated);
});

// Decline: either party may decline; this returns the charter to declined state
// (unlike terminate which is only for active charters)
router.post("/charter-parties/:id/decline", requireVesselAuth, async (req, res): Promise<void> => {
  const id = pId(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [cp] = await db.select().from(charterPartiesTable).where(eq(charterPartiesTable.id, id));
  if (!cp) { res.status(404).json({ error: "Charter party not found" }); return; }

  const auth = req.vesselAuth!;
  if (auth.userId !== cp.chartererId && auth.userId !== cp.ownerId && auth.role !== "admin") {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  if (!["enquiry", "negotiating"].includes(cp.status)) {
    res.status(400).json({ error: "Can only decline enquiries or negotiations in progress" }); return;
  }

  const now = new Date();
  const [updated] = await db.update(charterPartiesTable)
    .set({ status: "declined", updatedAt: now })
    .where(eq(charterPartiesTable.id, id))
    .returning();

  const [vessel] = await db.select({ name: vesselsTable.name }).from(vesselsTable).where(eq(vesselsTable.id, cp.vesselId));
  const otherPartyId = auth.userId === cp.chartererId ? cp.ownerId : cp.chartererId;
  await createNotification(
    otherPartyId,
    "charter_declined",
    "Charter Enquiry Declined",
    `The charter enquiry for ${vessel?.name ?? "vessel"} was declined`,
    id,
  );

  res.json(updated);
});

router.post("/charter-parties/:id/terminate", requireVesselAuth, async (req, res): Promise<void> => {
  const id = pId(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [cp] = await db.select().from(charterPartiesTable).where(eq(charterPartiesTable.id, id));
  if (!cp) { res.status(404).json({ error: "Charter party not found" }); return; }

  const auth = req.vesselAuth!;
  if (auth.userId !== cp.ownerId && auth.role !== "admin") {
    res.status(403).json({ error: "Only the vessel owner or admin can terminate a hire" }); return;
  }
  if (cp.status !== "active") {
    res.status(400).json({ error: "Only active charters can be terminated" }); return;
  }

  const now = new Date();
  await db.update(charterPartiesTable).set({ status: "terminated", updatedAt: now }).where(eq(charterPartiesTable.id, id));
  await db.update(vesselsTable).set({ status: "available", updatedAt: now }).where(eq(vesselsTable.id, cp.vesselId));

  const [vessel] = await db.select({ name: vesselsTable.name }).from(vesselsTable).where(eq(vesselsTable.id, cp.vesselId));
  await createNotification(cp.chartererId, "charter_terminated", "Charter Terminated", `The charter for ${vessel?.name} has been terminated`, id);
  await createNotification(cp.ownerId, "charter_terminated", "Charter Terminated", `Charter for ${vessel?.name} was terminated`, id);

  const [updated] = await db.select().from(charterPartiesTable).where(eq(charterPartiesTable.id, id));
  res.json(updated);
});

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────

router.get("/vessel-notifications", requireVesselAuth, async (req, res): Promise<void> => {
  const notifications = await db
    .select()
    .from(vesselNotificationsTable)
    .where(eq(vesselNotificationsTable.userId, req.vesselAuth!.userId));
  res.json(notifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
});

router.patch("/vessel-notifications/:id/read", requireVesselAuth, async (req, res): Promise<void> => {
  const id = pId(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [updated] = await db.update(vesselNotificationsTable).set({ read: true }).where(
    and(eq(vesselNotificationsTable.id, id), eq(vesselNotificationsTable.userId, req.vesselAuth!.userId))
  ).returning();
  if (!updated) { res.status(404).json({ error: "Notification not found" }); return; }
  res.json(updated);
});

router.post("/vessel-notifications/read-all", requireVesselAuth, async (req, res): Promise<void> => {
  await db.update(vesselNotificationsTable).set({ read: true }).where(eq(vesselNotificationsTable.userId, req.vesselAuth!.userId));
  res.json({ ok: true });
});

// ── ADMIN ─────────────────────────────────────────────────────────────────────

router.get("/vessel-admin/users", requireVesselAuth, requireVesselRole(["admin"]), async (req, res): Promise<void> => {
  const users = await db.select({
    id: vesselUsersTable.id,
    name: vesselUsersTable.name,
    email: vesselUsersTable.email,
    role: vesselUsersTable.role,
    company: vesselUsersTable.company,
    phone: vesselUsersTable.phone,
    createdAt: vesselUsersTable.createdAt,
  }).from(vesselUsersTable);
  res.json(users);
});

router.patch("/vessel-admin/users/:id/role", requireVesselAuth, requireVesselRole(["admin"]), async (req, res): Promise<void> => {
  const id = pId(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { role } = req.body ?? {};
  const allowed = ["client", "broker", "owner", "admin"];
  if (!allowed.includes(role)) { res.status(400).json({ error: "Invalid role" }); return; }
  const [user] = await db.update(vesselUsersTable).set({ role }).where(eq(vesselUsersTable.id, id)).returning({
    id: vesselUsersTable.id, name: vesselUsersTable.name, email: vesselUsersTable.email, role: vesselUsersTable.role,
    company: vesselUsersTable.company, phone: vesselUsersTable.phone, createdAt: vesselUsersTable.createdAt,
  });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(user);
});

export default router;
