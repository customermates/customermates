import type { ConfigurationChange } from "@/features/records/configuration.schema";
import type { RecordModel } from "@/features/records/record-model.schema";
import type { RecordRepo } from "@/features/records/record.repo";
import type { SetupModelLabels } from "../setup-model-compiler";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { RecordConfigurationService } from "@/features/records/configuration.service";
import { createMockUser } from "@/tests/helpers/mock-user";

export const SETUP_COMPANY_ID = "6d2b8e0e-3f43-4c1c-9a3c-5c1f0b8f2a11";
export const SETUP_ID = "0f8f6c1e-7b52-4f0a-a7a4-1d3c2b9e8f70";

export const SETUP_LABELS: SetupModelLabels = {
  channels: "Channels",
  avatar: "Avatar",
  value: "Value",
  price: "Price",
  lineItem: "Line item",
  lineItems: "Line items",
  quantity: "Quantity",
  pricingMode: "Pricing",
  savedPrice: "Saved unit price",
  effectivePrice: "Unit price",
  amount: "Amount",
  livePrice: "Live price",
  savedPriceMode: "Saved price",
};

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

export function emptyWorkspaceModel(): RecordModel {
  return { revision: 0, types: [], fields: [], relationships: [], accessPresets: [], capabilities: [] };
}

export function prepareConfiguration(change: ConfigurationChange, model: RecordModel) {
  return runWithTenant(user, () => new RecordConfigurationService(emptyRepo).prepare(change, model, adminPolicy));
}
