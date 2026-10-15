import type { CSSProperties } from "react";

const AVATAR_HUES = ["primary", "secondary", "success", "warning", "danger"] as const;

export function workspaceAvatarHue(companyId: string): (typeof AVATAR_HUES)[number] {
  let hash = 0;
  for (const character of companyId) hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  return AVATAR_HUES[hash % AVATAR_HUES.length];
}

export function workspaceAvatarStyle(companyId: string): CSSProperties {
  const hue = workspaceAvatarHue(companyId);
  return { backgroundColor: `var(--chart-${hue}-3)`, color: `var(--chart-${hue}-text)` };
}

export function workspaceDisplayName(name: string | null | undefined, fallback: string): string {
  return name?.trim() || fallback;
}
