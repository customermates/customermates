import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { RecordPhoneIdentityRepo } from "./record-phone-identity.repo";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

import { renormalizedPhoneIdentityValue } from "./phone-identity-value";

const PHONE_IDENTITY_COMPANY_PAGE = 200;
const PHONE_IDENTITY_VALUE_PAGE = 1000;

@SystemInteractor
export class NormalizePhoneIdentitiesInteractor {
  constructor(
    private repo: Pick<RecordPhoneIdentityRepo, "findPhoneIdentityCompaniesUnscoped">,
    private identities: (companyId: string) => Pick<RecordPhoneIdentityRepo, "findPhoneIdentityValuesCompanyWide">,
    private background: Pick<BackgroundTaskService, "dispatch">,
  ) {}

  async invoke(): Promise<{ dispatched: string[] }> {
    const dispatched: string[] = [];
    let after: string | null = null;
    for (;;) {
      const companies = await this.repo.findPhoneIdentityCompaniesUnscoped(after, PHONE_IDENTITY_COMPANY_PAGE);
      for (const companyId of companies) {
        if (!(await this.needsNewValues(companyId))) continue;
        await this.background.dispatch("normalize-phone-identities", { companyId });
        dispatched.push(companyId);
      }
      if (companies.length < PHONE_IDENTITY_COMPANY_PAGE) return { dispatched };
      after = companies.at(-1) ?? null;
    }
  }

  private async needsNewValues(companyId: string): Promise<boolean> {
    const identities = this.identities(companyId);
    let after: string | null = null;
    for (;;) {
      const rows = await identities.findPhoneIdentityValuesCompanyWide(after, PHONE_IDENTITY_VALUE_PAGE);
      if (rows.some((row) => renormalizedPhoneIdentityValue(row.value))) return true;
      if (rows.length < PHONE_IDENTITY_VALUE_PAGE) return false;
      after = rows.at(-1)?.id ?? null;
    }
  }
}
