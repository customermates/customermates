import { z } from "zod";
import type { RecordNavigation } from "@/features/records/record-navigation.schema";
import type { AgentUiTarget } from "./ui-targets";

export const RECORD_LIST_CONTROLS = [
  "add",
  "search",
  "filter",
  "display-options",
  "layout-table",
  "layout-board",
  "configure",
] as const;
const ControlSchema = z.enum(RECORD_LIST_CONTROLS);

export function recordUiTarget(targetId: string): AgentUiTarget | null {
  const parts = targetId.split(":");
  const type = z.uuid().safeParse(parts[1]);
  if (!type.success) return null;
  const route = `/records/${type.data}`;
  if (parts.length === 2 && parts[0] === "nav-records")
    return { id: targetId, route, description: "Sidebar link to a configured record list" };
  const control = ControlSchema.safeParse(parts[2]);
  if (parts.length !== 3 || parts[0] !== "records" || !control.success) return null;
  return {
    id: targetId,
    elementId: `records-${control.data}`,
    route,
    description: `Record list ${control.data.replace(/-/g, " ")}`,
    ...(control.data.startsWith("layout-") ? { prerequisite: `records:${type.data}:display-options` } : {}),
  };
}

export function recordUiTargets(navigation: RecordNavigation): AgentUiTarget[] {
  return navigation.types.flatMap((type) => {
    const ids = [
      `nav-records:${type.id}`,
      ...RECORD_LIST_CONTROLS.filter(
        (control) => (control !== "add" || type.canCreate) && (control !== "configure" || navigation.canManageSchema),
      ).map((control) => `records:${type.id}:${control}`),
    ];
    return ids.flatMap((id) => {
      const target = recordUiTarget(id);
      return target
        ? [{ ...target, description: `${target.description}; list label: ${JSON.stringify(type.pluralLabel)}` }]
        : [];
    });
  });
}
