import { findAgentUiTarget } from "@/ee/agent-chat/ui-targets";

export const FOCUS_KINDS = [
  "list",
  "field",
  "relationship",
  "routine",
  "webhook",
  "widget",
  "view",
  "record",
  "control",
] as const;
export type FocusKind = (typeof FOCUS_KINDS)[number];
export type FocusTarget = { kind: FocusKind; id: string };

export const FOCUS_PARAM = "focus";

export const focusKey = (target: FocusTarget) => `${target.kind}:${target.id}`;

export function parseFocus(value: string | null | undefined): FocusTarget | null {
  const separator = value?.indexOf(":") ?? -1;
  if (!value || separator < 0) return null;
  const kind = value.slice(0, separator) as FocusKind;
  return FOCUS_KINDS.includes(kind) ? { kind, id: value.slice(separator + 1) } : null;
}

export function focusTargetOfHref(href: string): FocusTarget | null {
  const query = href.split("#")[0].split("?")[1];
  return query ? parseFocus(new URLSearchParams(query).get(FOCUS_PARAM)) : null;
}

export function focusHref(target: FocusTarget & { typeId?: string }): string {
  const focus = `${FOCUS_PARAM}=${encodeURIComponent(focusKey(target))}`;
  if (target.kind === "list") return `/configure?${focus}`;
  if (target.kind === "field") return `/configure?typeId=${target.typeId}&tab=fields&${focus}`;
  if (target.kind === "relationship") return `/configure?typeId=${target.typeId}&tab=relationships&${focus}`;
  if (target.kind === "routine") return `/routines?${focus}`;
  if (target.kind === "webhook") return `/company/webhooks?${focus}`;
  if (target.kind === "widget") return `/dashboard?${focus}`;
  if (target.kind === "view") return `/records/${target.typeId}?view=${target.id}&${focus}`;
  if (target.kind === "control") return `${findAgentUiTarget(target.id)?.route ?? ""}?${focus}`;
  return `/records/${target.typeId}/${target.id}?${focus}`;
}
