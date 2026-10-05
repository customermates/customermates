import { presetId } from "@/features/records/crm-preset";

export function syntheticRecordKeys(companyId: string) {
  const id = (key: string) => presetId(companyId, key);
  return {
    id,
    surface: (type: string) => `records:${id(type)}`,
    relationship: (key: string, direction: "outgoing" | "incoming") => `relationship:${id(key)}:${direction}`,
    path: (key: string) => `path:${id(key)}`,
  };
}
