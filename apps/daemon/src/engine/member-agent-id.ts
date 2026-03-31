function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function slugifyMemberName(name: string): string {
  const normalized = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.slice(0, 48) || "member";
}

function localTimestamp(at: Date): string {
  return [
    at.getFullYear(),
    pad(at.getMonth() + 1),
    pad(at.getDate())
  ].join("") + `-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
}

export function buildReadableMemberAgentId(name: string, at: Date = new Date()): string {
  return `chillclaw-member-${slugifyMemberName(name)}-${localTimestamp(at)}`;
}

export function resolveReadableMemberAgentId(
  name: string,
  existingIds: Iterable<string>,
  at: Date = new Date()
): string {
  const baseId = buildReadableMemberAgentId(name, at);
  const taken = new Set(existingIds);

  if (!taken.has(baseId)) {
    return baseId;
  }

  let suffix = 2;
  while (taken.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseId}-${suffix}`;
}
