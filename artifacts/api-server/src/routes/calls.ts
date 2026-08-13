import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";

import { appStateTable, db, staffUsersTable } from "@workspace/db";

const router: IRouter = Router();
const DAILY_API_URL = "https://api.daily.co/v1";
const CALL_STATE_KEY = "callSessions";
const CALL_TTL_SECONDS = 60 * 60;

type CallKind = "audio" | "video";

interface CallSession {
  id: string;
  roomName: string;
  roomUrl: string;
  kind: CallKind;
  callerUsername: string;
  callerName: string;
  recipientUsername: string;
  recipientName: string;
  createdAt: string;
  expiresAt: number;
}

function dailyHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.DAILY_API_KEY ?? ""}`,
    "Content-Type": "application/json",
  };
}

async function dailyRequest<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${DAILY_API_URL}${path}`, {
    method: "POST",
    headers: dailyHeaders(),
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Daily API ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload as T;
}

async function loadSessions(): Promise<CallSession[]> {
  const [row] = await db
    .select()
    .from(appStateTable)
    .where(eq(appStateTable.key, CALL_STATE_KEY));
  if (!Array.isArray(row?.data)) return [];
  const now = Math.floor(Date.now() / 1000);
  return (row.data as CallSession[]).filter(session => session.expiresAt > now);
}

async function saveSessions(sessions: CallSession[]): Promise<void> {
  await db
    .insert(appStateTable)
    .values({ key: CALL_STATE_KEY, data: sessions })
    .onConflictDoUpdate({
      target: appStateTable.key,
      set: { data: sessions, updatedAt: new Date() },
    });
}

async function getCurrentUser(username: string): Promise<{ name: string; role: string | null } | null> {
  const [user] = await db
    .select({ empName: staffUsersTable.empName, role: staffUsersTable.role })
    .from(staffUsersTable)
    .where(eq(staffUsersTable.username, username));
  return user ? { name: user.empName, role: user.role } : null;
}

async function createMeetingToken(
  roomName: string,
  username: string,
  displayName: string,
  expiresAt: number,
): Promise<string> {
  const response = await dailyRequest<{ token: string }>("/meeting-tokens", {
    properties: {
      room_name: roomName,
      user_id: username,
      user_name: displayName,
      is_owner: false,
      exp: expiresAt,
    },
  });
  if (!response.token) throw new Error("Daily did not return a meeting token");
  return response.token;
}

router.post("/calls", async (req, res): Promise<void> => {
  if (!process.env.DAILY_API_KEY) {
    res.status(503).json({ error: "In-app calling is not configured" });
    return;
  }

  const callerUsername = req.auth?.username;
  const { recipientUsername, recipientName, kind } = req.body ?? {};
  if (
    !callerUsername ||
    typeof recipientUsername !== "string" ||
    typeof recipientName !== "string" ||
    (kind !== "audio" && kind !== "video")
  ) {
    res.status(400).json({ error: "recipientUsername, recipientName, and kind are required" });
    return;
  }

  const caller = await getCurrentUser(callerUsername);
  if (!caller) {
    res.status(401).json({ error: "Caller account not found" });
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + CALL_TTL_SECONDS;
  const callId = `call_${Date.now()}_${randomBytes(8).toString("hex")}`;
  const roomName = `petrotrack_${callId}`;

  try {
    const room = await dailyRequest<{ url: string }>("/rooms", {
      name: roomName,
      privacy: "private",
      properties: {
        exp: expiresAt,
        start_audio_off: false,
        start_video_off: kind === "audio",
      },
    });
    const token = await createMeetingToken(roomName, callerUsername, caller.name, expiresAt);
    const session: CallSession = {
      id: callId,
      roomName,
      roomUrl: room.url,
      kind,
      callerUsername,
      callerName: caller.name,
      recipientUsername,
      recipientName,
      createdAt: new Date().toISOString(),
      expiresAt,
    };
    const sessions = await loadSessions();
    await saveSessions([...sessions, session]);
    res.json({ callId, roomUrl: room.url, token, kind, peerName: recipientName, expiresAt });
  } catch (error) {
    req.log.error({ err: error }, "Failed to create Daily call");
    res.status(502).json({ error: "Unable to start the in-app call" });
  }
});

router.post("/calls/:callId/token", async (req, res): Promise<void> => {
  if (!process.env.DAILY_API_KEY) {
    res.status(503).json({ error: "In-app calling is not configured" });
    return;
  }

  const username = req.auth?.username;
  const session = (await loadSessions()).find(item => item.id === req.params.callId);
  if (!username || !session) {
    res.status(404).json({ error: "Call no longer exists" });
    return;
  }

  const isParticipant = username === session.callerUsername || username === session.recipientUsername;
  if (!isParticipant) {
    res.status(403).json({ error: "You are not a participant in this call" });
    return;
  }

  const currentUser = await getCurrentUser(username);
  if (!currentUser) {
    res.status(401).json({ error: "User account not found" });
    return;
  }

  try {
    const token = await createMeetingToken(session.roomName, username, currentUser.name, session.expiresAt);
    const peerName = username === session.callerUsername ? session.recipientName : session.callerName;
    res.json({
      callId: session.id,
      roomUrl: session.roomUrl,
      token,
      kind: session.kind,
      peerName,
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    req.log.error({ err: error, callId: session.id }, "Failed to create Daily participant token");
    res.status(502).json({ error: "Unable to join the in-app call" });
  }
});

export default router;