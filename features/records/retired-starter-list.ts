import { RETIRED_RECORD_LIST_PRESETS } from "@/core/seo/route-aliases";

import { deterministicId } from "./deterministic-id";

const RETIRED_STARTER_LISTS: readonly string[] = Object.values(RETIRED_RECORD_LIST_PRESETS);

export function retiredStarterListTypeId(companyId: string, preset: string): string | null {
  return RETIRED_STARTER_LISTS.includes(preset) ? deterministicId(companyId, preset) : null;
}
