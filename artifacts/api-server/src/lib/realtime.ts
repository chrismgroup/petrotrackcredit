import { createHash } from "crypto";
import type { Server } from "http";
import type { Duplex } from "stream";
import jwt from "jsonwebtoken";
import type { AuthPayload } from "../middlewares/requireAuth";

const clients = new Set<Duplex>();

function frame(payload: string, opcode = 0x1): Buffer {
  const body = Buffer.from(payload);
  if (body.length < 126) return Buffer.concat([Buffer.from([0x80 | opcode, body.length]), body]);
  const header = Buffer.alloc(4);
  header[0] = 0x80 | opcode;
  header[1] = 126;
  header.writeUInt16BE(body.length, 2);
  return Buffer.concat([header, body]);
}

export function attachRealtimeServer(server: Server): void {
  server.on("upgrade", (req, socket): void => {
    const requestUrl = new URL(req.url ?? "/", "http://localhost");
    if (requestUrl.pathname !== "/api/realtime") {
      socket.destroy();
      return;
    }
    const protocols = String(req.headers["sec-websocket-protocol"] ?? "")
      .split(",")
      .map(value => value.trim());
    const token = protocols[0] === "petrotrack" ? protocols[1] : null;
    const secret = process.env.JWT_SECRET;
    const key = req.headers["sec-websocket-key"];
    if (!token || !secret || !key) {
      socket.destroy();
      return;
    }
    try {
      jwt.verify(token, secret) as AuthPayload;
    } catch {
      socket.destroy();
      return;
    }
    const accept = createHash("sha1")
      .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest("base64");
    socket.write([
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${accept}`,
      "Sec-WebSocket-Protocol: petrotrack",
      "\r\n",
    ].join("\r\n"));
    clients.add(socket);
    socket.on("close", () => clients.delete(socket));
    socket.on("error", () => clients.delete(socket));
    socket.on("data", data => {
      const opcode = data[0] & 0x0f;
      if (opcode === 0x8) socket.end();
      if (opcode === 0x9) socket.write(frame("", 0xA));
    });
    socket.write(frame(JSON.stringify({ type: "connected" })));
  });
}

export function broadcastRealtime(event: Record<string, unknown>): void {
  const payload = frame(JSON.stringify(event));
  for (const client of clients) {
    if (client.destroyed || !client.writable) clients.delete(client);
    else client.write(payload);
  }
}