import type { DeleteAccountForBillingService } from "./delete-account-for-billing.service";
import type { EmailService } from "@/features/email/email.service";
import type { Locale, MessagingProvider, SubscriptionPlan } from "@/generated/prisma";

import AccountsRemovedNotice from "@/components/emails/accounts-removed-notice";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { getEntitlements } from "@/ee/subscription/entitlements";
import { getTranslator } from "@/i18n/get-translator";
import { resolveUserLocale } from "@/i18n/user-locale";
import { env } from "@/env";

type ActiveAccount = {
  id: string;
  userId: string;
  createdAt: Date;
  provider: MessagingProvider;
  displayName: string | null;
  emailAddress: string | null;
};

type CompanyAdmin = {
  id: string;
  email: string;
  firstName: string;
  displayLanguage: Locale | null;
};

export abstract class DeleteAccountsForPlanConnectedAccountRepo {
  abstract listActiveAccountsForCompanyUnscoped(companyId: string): Promise<ActiveAccount[]>;
}

export abstract class DeleteAccountsForPlanUserRepo {
  abstract findCompanyAdminsUnscoped(companyId: string): Promise<CompanyAdmin[]>;
}

export type DeleteAccountsForPlanPayload = { companyId: string; plan: SubscriptionPlan };

@SystemInteractor
export class DeleteAccountsForPlanInteractor {
  constructor(
    private connectedAccountRepo: DeleteAccountsForPlanConnectedAccountRepo,
    private userRepo: DeleteAccountsForPlanUserRepo,
    private deleteService: DeleteAccountForBillingService,
    private emailService: EmailService,
  ) {}

  async invoke(payload: DeleteAccountsForPlanPayload): Promise<void> {
    const included = getEntitlements(payload.plan).includedAccountsPerUser;
    if (included === "unlimited") return;

    const accounts = await this.connectedAccountRepo.listActiveAccountsForCompanyUnscoped(payload.companyId);

    const byUser = new Map<string, ActiveAccount[]>();
    for (const account of accounts) byUser.set(account.userId, [...(byUser.get(account.userId) ?? []), account]);

    const overage = [...byUser.values()].flatMap((list) =>
      [...list]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, Math.max(0, list.length - included)),
    );
    if (overage.length === 0) return;

    for (const account of overage) await this.deleteService.deleteForBillingOrThrow(account.id);

    await this.notifyAdmins(payload.companyId, payload.plan, overage);
  }

  private async notifyAdmins(
    companyId: string,
    plan: SubscriptionPlan,
    removedAccounts: ActiveAccount[],
  ): Promise<void> {
    const admins = await this.userRepo.findCompanyAdminsUnscoped(companyId);
    if (admins.length === 0) return;

    const accountsLabel = removedAccounts
      .map((account) => `${account.provider} (${account.displayName ?? account.emailAddress ?? account.id})`)
      .join(", ");
    for (const admin of admins) {
      const locale = resolveUserLocale(admin);
      const href = `${env.BASE_URL}/profile/connected-accounts`;
      const t = await getTranslator(locale, "AccountsRemovedNotice");

      await this.emailService.send({
        to: admin.email,
        subject: t("subject"),
        react: AccountsRemovedNotice({
          locale,
          greeting: t("greeting", { firstName: admin.firstName }),
          body: t("body", { accounts: accountsLabel, plan: plan.charAt(0).toUpperCase() + plan.slice(1) }),
          cta: t("cta"),
          signoff: t("signoff"),
          subject: t("subject"),
          title: t("title"),
          href,
        }),
      });
    }
  }
}
