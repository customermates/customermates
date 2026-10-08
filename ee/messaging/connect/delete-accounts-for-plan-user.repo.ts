import type { Locale } from "@/generated/prisma";

type CompanyAdmin = {
  id: string;
  email: string;
  firstName: string;
  displayLanguage: Locale | null;
};

export abstract class DeleteAccountsForPlanUserRepo {
  abstract findCompanyAdminsUnscoped(companyId: string): Promise<CompanyAdmin[]>;
}
