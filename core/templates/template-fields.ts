import type { TemplateSpecObject } from "./template-spec.schema";

import { setupAnchorFields } from "@/features/workspace-setup/setup-anchors";

export type TemplateFieldOrigin = "declared" | "stage" | "calculation" | "anchor" | "name";
export type TemplateFieldInfo = { ref: string; type: string; options: string[]; origin: TemplateFieldOrigin };
export type TemplateModelParts = Pick<TemplateSpecObject, "lists" | "fields" | "stages" | "calculations">;

const ANCHOR_TYPES: Readonly<Record<string, string>> = {
  channels: "channels",
  avatar: "url",
  value: "currency",
  price: "currency",
};

export function templateFieldIndex(spec: TemplateModelParts): Map<string, TemplateFieldInfo> {
  const index = new Map<string, TemplateFieldInfo>();
  const add = (info: TemplateFieldInfo) => index.set(info.ref, info);
  for (const list of spec.lists) add({ ref: `${list.key}.name`, type: "text", options: [], origin: "name" });
  for (const ref of setupAnchorFields(spec.lists))
    add({ ref, type: ANCHOR_TYPES[ref.split(".")[1] ?? ""] ?? "text", options: [], origin: "anchor" });

  for (const field of spec.fields) {
    const options = field.options.map((option) => option.key);
    add({ ref: field.key, type: field.type, options, origin: "declared" });
    if (field.type === "dateRange") {
      add({ ref: `${field.key}_from`, type: "date", options: [], origin: "declared" });
      add({ ref: `${field.key}_to`, type: "date", options: [], origin: "declared" });
    }
  }
  for (const stage of spec.stages)
    add({ ref: stage.field, type: "select", options: stage.items.map((item) => item.key), origin: "stage" });

  for (const calculation of spec.calculations)
    add({ ref: calculation.key, type: calculation.type, options: [], origin: "calculation" });

  return index;
}

export function templateRoleList(spec: Pick<TemplateSpecObject, "lists">, role: string): string | null {
  return spec.lists.find((list) => list.role === role)?.key ?? null;
}

export function templateStageField(spec: Pick<TemplateSpecObject, "stages">, ref: string) {
  return spec.stages.find((stage) => stage.field === ref) ?? null;
}
