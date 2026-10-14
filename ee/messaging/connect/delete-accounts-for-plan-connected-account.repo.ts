import type { MessagingProvider } from "@/generated/prisma";

export type ActiveAccount = {
  id: string;
  userId: string;
  createdAt: Date;
  provider: MessagingProvider;
  displayName: string | null;
  emailAddress: string | null;
};

export abstract class DeleteAccountsForPlanConnectedAccountRepo {
  abstract listActiveAccountsForCompanyUnscoped(companyId: string): Promise<ActiveAccount[]>;
}
