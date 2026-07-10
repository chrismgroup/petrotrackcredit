function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function randomSalt(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return bufToHex(arr.buffer);
}

async function sha256Hex(data: string): Promise<string> {
  const encoded = new TextEncoder().encode(data);
  const buf = await crypto.subtle.digest('SHA-256', encoded);
  return bufToHex(buf);
}

const PREFIX = 'sha256:';

export async function hashPassword(plaintext: string): Promise<string> {
  const salt = randomSalt();
  const hash = await sha256Hex(salt + plaintext);
  return `${PREFIX}${salt}:${hash}`;
}

export async function verifyPassword(plaintext: string, stored: string): Promise<boolean> {
  if (!stored.startsWith(PREFIX)) {
    // Legacy plaintext: direct comparison during migration window so users with
    // unhashed accounts can still verify (e.g., changeOwnPassword, offline fallback).
    // Once their password is changed or reset, the new value will be hashed.
    return stored === plaintext;
  }
  const inner = stored.slice(PREFIX.length);
  const colon = inner.indexOf(':');
  if (colon < 0) return false;
  const salt = inner.slice(0, colon);
  const expected = inner.slice(colon + 1);
  const actual = await sha256Hex(salt + plaintext);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) {
    diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
