import { Router, type IRouter, type Request, type Response } from "express";
import { ChatError, chatStore, parsePositiveInt, type ChatMessageDTO } from "../lib/chatStore";
import { sendRealtimeToUsers } from "../lib/realtime";
import { pushToUsers } from "./notifications";

const router: IRouter = Router();

function me(req: Request): string {
  const username = req.auth?.username;
  if (!username) throw new ChatError(401, "Sign in again to use chat.");
  return username;
}

function idParam(req: Request, name: string): number {
  const id = parsePositiveInt(req.params[name]);
  if (!id) throw new ChatError(400, "Invalid id.");
  return id;
}

function handle(fn: (req: Request, res: Response) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    try {
      const result = await fn(req, res);
      if (!res.headersSent) res.json(result ?? { ok: true });
    } catch (error) {
      if (error instanceof ChatError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      req.log?.error({ err: error }, "Chat request failed");
      res.status(500).json({ error: "Chat is unavailable right now. Please try again." });
    }
  };
}

/** Tells every member's open app to refresh this chat. */
async function notifyMembers(conversationId: number, extra: string[] = []): Promise<void> {
  try {
    const members = await chatStore.memberUsernames(conversationId);
    sendRealtimeToUsers([...members, ...extra], { type: "chat.changed", conversationId });
  } catch {
    // Clients also refresh on a timer.
  }
}

async function pushNewMessage(sender: string, message: ChatMessageDTO): Promise<void> {
  try {
    const conversation = await chatStore.getConversation(sender, message.conversationId);
    const recipients = conversation.members.map(m => m.username).filter(u => u !== sender);
    const preview = message.body || (message.media ? `📎 ${message.media.name}` : "New message");
    const title = conversation.kind === "group" ? conversation.name ?? "Group chat" : message.senderName;
    const body = conversation.kind === "group" ? `${message.senderName}: ${preview}` : preview;
    await pushToUsers(recipients, title, body.slice(0, 180), {
      route: "/(app)/messages", conversationId: message.conversationId,
    });
  } catch {
    // Push is best-effort; the message is already saved.
  }
}

router.get("/chat/conversations", handle(async req => ({
  conversations: await chatStore.listConversations(me(req)),
})));

router.get("/chat/unread", handle(async req => ({ total: await chatStore.unreadTotal(me(req)) })));

router.post("/chat/conversations", handle(async (req, res) => {
  const username = me(req);
  const kind = req.body?.kind;
  const conversation = kind === "group"
    ? await chatStore.createGroup(username, req.body?.name, req.body?.members)
    : await chatStore.openDirect(username, typeof req.body?.username === "string" ? req.body.username.trim() : "");
  res.status(kind === "group" ? 201 : 200);
  if (kind === "group") void notifyMembers(conversation.id);
  return { conversation };
}));

router.get("/chat/conversations/:id", handle(async req => ({
  conversation: await chatStore.getConversation(me(req), idParam(req, "id")),
})));

router.patch("/chat/conversations/:id", handle(async req => {
  const id = idParam(req, "id");
  const conversation = await chatStore.renameGroup(me(req), id, req.body?.name);
  void notifyMembers(id);
  return { conversation };
}));

router.post("/chat/conversations/:id/members", handle(async req => {
  const id = idParam(req, "id");
  const conversation = await chatStore.addMembers(me(req), id, req.body?.usernames);
  void notifyMembers(id);
  return { conversation };
}));

router.delete("/chat/conversations/:id/members/:username", handle(async req => {
  const id = idParam(req, "id");
  const target = String(req.params.username ?? "").trim();
  const result = await chatStore.removeMember(me(req), id, target);
  void notifyMembers(id, [target]);
  return { ok: true, ...result };
}));

router.post("/chat/conversations/:id/members/:username/role", handle(async req => {
  const id = idParam(req, "id");
  const conversation = await chatStore.setMemberRole(me(req), id, String(req.params.username ?? "").trim(), req.body?.role);
  void notifyMembers(id);
  return { conversation };
}));

router.post("/chat/conversations/:id/archive", handle(async req => {
  await chatStore.setArchived(me(req), idParam(req, "id"), req.body?.archived !== false);
  return { ok: true };
}));

router.post("/chat/conversations/:id/read", handle(async req => {
  const id = idParam(req, "id");
  const lastReadMessageId = await chatStore.markRead(me(req), id, parsePositiveInt(req.body?.upToId));
  void notifyMembers(id);
  return { ok: true, lastReadMessageId };
}));

router.get("/chat/conversations/:id/messages", handle(async req => chatStore.listMessages(me(req), idParam(req, "id"), {
  before: parsePositiveInt(req.query.before),
  limit: parsePositiveInt(req.query.limit) ?? undefined,
  q: typeof req.query.q === "string" ? req.query.q : undefined,
})));

router.get("/chat/conversations/:id/pinned", handle(async req => ({
  messages: await chatStore.pinnedMessages(me(req), idParam(req, "id")),
})));

router.post("/chat/conversations/:id/messages", handle(async (req, res) => {
  const username = me(req);
  const id = idParam(req, "id");
  const message = await chatStore.sendMessage(username, id, {
    body: req.body?.body, media: req.body?.media, replyToId: req.body?.replyToId,
  });
  res.status(201);
  void notifyMembers(id);
  void pushNewMessage(username, message);
  return { message };
}));

router.post("/chat/messages/:id/forward", handle(async req => {
  const conversationIds = await chatStore.forwardMessage(me(req), idParam(req, "id"), req.body?.conversationIds);
  for (const conversationId of conversationIds) void notifyMembers(conversationId);
  return { ok: true, conversationIds };
}));

router.patch("/chat/messages/:id", handle(async req => {
  const { conversationId, message } = await chatStore.editMessage(me(req), idParam(req, "id"), req.body?.body);
  void notifyMembers(conversationId);
  return { message };
}));

router.delete("/chat/messages/:id", handle(async req => {
  const username = me(req);
  const result = await chatStore.deleteMessage(username, idParam(req, "id"), req.query.scope ?? req.body?.scope);
  if (result.scope === "everyone") void notifyMembers(result.conversationId);
  return { ok: true, ...result };
}));

router.post("/chat/messages/:id/reactions", handle(async req => {
  const { conversationId, message } = await chatStore.toggleReaction(me(req), idParam(req, "id"), req.body?.emoji);
  void notifyMembers(conversationId);
  return { message };
}));

router.post("/chat/messages/:id/pin", handle(async req => {
  const { conversationId, message } = await chatStore.setPinned(me(req), idParam(req, "id"), req.body?.pinned !== false);
  void notifyMembers(conversationId);
  return { message };
}));

router.get("/chat/messages/:id/info", handle(async req => chatStore.messageInfo(me(req), idParam(req, "id"))));

export default router;
