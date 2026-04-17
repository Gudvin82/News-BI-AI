import type { SessionContext } from "@/lib/auth/session";

function normalizeSection(value: string) {
  return value.trim().toLowerCase();
}

function hasSection(list: string[] | undefined, section: string) {
  const target = normalizeSection(section);
  if (!Array.isArray(list) || list.length === 0) return false;
  const normalized = list.map(normalizeSection);
  return normalized.includes("all")
    || normalized.includes(target)
    || normalized.some((x) => target.startsWith(`${x}.`));
}

export function canViewSection(session: SessionContext, section: string) {
  if (session.role === "owner") return true;
  return hasSection(session.visibleSections, section);
}

export function canEditSection(session: SessionContext, section: string) {
  if (session.role === "owner") return true;
  return hasSection(session.editableSections, section);
}

