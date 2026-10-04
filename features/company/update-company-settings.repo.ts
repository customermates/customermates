import type { Currency } from "@/generated/prisma";

export abstract class UpdateCompanySettingsRepo {
  abstract updateDetails(args: { currency?: Currency }): Promise<void>;
}
