import type { ConfigurationChange } from "@/features/records/configuration.schema";
import type { RecordModel } from "@/features/records/record-model.schema";
import type { RecordRepo } from "@/features/records/record.repo";
import type { AppLocale } from "@/i18n/locale-registry";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { RecordConfigurationService } from "@/features/records/configuration.service";
import { createWorkspaceRecordPreset } from "@/features/records/workspace-record-preset";
import { getTranslator } from "@/i18n/get-translator";
import { createMockUser } from "@/tests/helpers/mock-user";

export const SETUP_COMPANY_ID = "6d2b8e0e-3f43-4c1c-9a3c-5c1f0b8f2a11";
export const SETUP_ID = "0f8f6c1e-7b52-4f0a-a7a4-1d3c2b9e8f70";

const user = createMockUser({ companyId: SETUP_COMPANY_ID });

const emptyRepo = new Proxy(
  {},
  {
    get: (_target, name) => () => Promise.resolve(String(name).startsWith("count") ? 0 : []),
  },
) as RecordRepo;

const adminPolicy = {
  actor: { id: user.id, role: user.role },
  isAdmin: true,
  canManageSchema: true,
  canManageRoles: true,
  readScope: () => "all",
  allowed: () => true,
} as never;

export async function workspacePreset(locale: AppLocale = "en"): Promise<RecordModel> {
  return createWorkspaceRecordPreset(SETUP_COMPANY_ID, await getTranslator(locale));
}

export function prepareConfiguration(change: ConfigurationChange, model: RecordModel) {
  return runWithTenant(user, () => new RecordConfigurationService(emptyRepo).prepare(change, model, adminPolicy));
}
