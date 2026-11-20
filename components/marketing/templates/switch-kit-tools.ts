export const SWITCH_KIT_TOOLS = ["sheets", "notion", "airtable", "trello", "smartsheet", "clickup"] as const;

export type SwitchKitTool = (typeof SWITCH_KIT_TOOLS)[number];

export const SWITCH_KIT_TEMPLATE = "custom-crm";

export const SWITCH_KIT_CHECKED_ON = "2026-11-12";

export function isSwitchKitTool(value: string): value is SwitchKitTool {
  return (SWITCH_KIT_TOOLS as readonly string[]).includes(value);
}
