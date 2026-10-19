import { presetId } from "./crm-preset";
import { RECORD_PRESET_KEYS } from "./workspace-record-preset";

export function retiredStarterListTypeId(companyId: string, preset: string): string | null {
  return RECORD_PRESET_KEYS.some((key) => key === preset) ? presetId(companyId, preset) : null;
}
