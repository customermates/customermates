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

type ListedWorkspace = { companyId: string; name: string | null; createdAt: Date };

export function workspaceListName(
  workspace: ListedWorkspace,
  workspaces: readonly ListedWorkspace[],
  fallback: string,
  withCreationDate: (date: string) => string,
): string {
  if (workspace.name?.trim()) return workspace.name.trim();
  const unnamed = workspaces.filter((candidate) => !candidate.name?.trim());
  if (unnamed.length < 2) return fallback;

  const day = creationDay(workspace);
  const sameDay = unnamed
    .filter((candidate) => creationDay(candidate) === day)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.companyId.localeCompare(b.companyId));
  const position = sameDay.findIndex((candidate) => candidate.companyId === workspace.companyId);
  const label = withCreationDate(day);

  return position > 0 ? `${label} ${position + 1}` : label;
}

function creationDay(workspace: Pick<ListedWorkspace, "createdAt">): string {
  return workspace.createdAt.toISOString().slice(0, 10);
}
