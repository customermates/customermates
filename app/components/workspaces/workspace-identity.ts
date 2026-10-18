import type { CSSProperties } from "react";

import { getChartColors, getChartTextColors } from "@/constants/chart-colors";

const AVATAR_HUES = ["primary", "secondary", "success", "warning", "danger"] as const;

export function workspaceAvatarHue(companyId: string): (typeof AVATAR_HUES)[number] {
  let hash = 0;
  for (const character of companyId) hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  return AVATAR_HUES[hash % AVATAR_HUES.length];
}

export function workspaceAvatarStyle(companyId: string): CSSProperties {
  const color = `${workspaceAvatarHue(companyId)}3` as const;
  return { backgroundColor: getChartColors()[color], color: getChartTextColors()[color] };
}

export function workspaceDisplayName(name: string | null | undefined, fallback: string): string {
  return name?.trim() || fallback;
}

type ListedWorkspace = { name: string | null; createdAt: Date };

export function workspaceListName(
  workspace: ListedWorkspace,
  workspaces: readonly Pick<ListedWorkspace, "name">[],
  fallback: string,
  withCreationDate: (date: string) => string,
): string {
  if (workspace.name?.trim()) return workspace.name.trim();
  if (workspaces.filter((candidate) => !candidate.name?.trim()).length < 2) return fallback;

  return withCreationDate(workspace.createdAt.toISOString().slice(0, 10));
}
