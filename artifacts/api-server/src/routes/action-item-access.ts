function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function canAccessActionItemsForUser(
  role: string,
  staffId: number | null,
  roleAccess: unknown,
  userAccess: unknown,
): boolean {
  if (role === "admin") return true;
  const override = staffId === null ? null : record(record(userAccess)?.[String(staffId)])?.actionItems;
  if (typeof override === "boolean") return override;
  return record(record(roleAccess)?.[role])?.actionItems !== false;
}
