import type { DeleteAccountForBillingService } from "./delete-account-for-billing.service";
import type {
  ActiveAccount,
  DeleteAccountsForPlanConnectedAccountRepo,
} from "./delete-accounts-for-plan-connected-account.repo";
import type { DeleteAccountsForPlanUserRepo } from "./delete-accounts-for-plan-user.repo";
import type { EmailService } from "@/features/email/email.service";
import type { SubscriptionPlan } from "@/generated/prisma";

import AccountsRemovedNotice from "@/components/emails/accounts-removed-notice";
import { getEmailLayoutCopy } from "@/components/emails/base/email-layout-copy";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { getEntitlements } from "@/ee/subscription/entitlements";
import { getTranslator } from "@/i18n/get-translator";
import { resolveUserLocale } from "@/i18n/user-locale";
import { env } from "@/env";
import { settingsHref } from "@/app/components/navigation/settings-routes";

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

    for (const account of overage) await this.deleteService.deleteForBillingOrThrow(account.id, "planDowngrade");

    await this.notifyAdmins(payload.companyId, payload.plan, overage);
  }

  private async notifyAdmins(
    companyId: string,
    plan: SubscriptionPlan,
    removedAccounts: ActiveAccount[],
  ): Promise<void> {
    const admins = await this.userRepo.findCompanyAdminsUnscoped(companyId);
    if (admins.length === 0) return;

    for (const admin of admins) {
      const locale = resolveUserLocale(admin);
      const href = `${env.BASE_URL}${settingsHref("channels")}`;
      const t = await getTranslator(locale);
      const layoutCopy = await getEmailLayoutCopy(locale);
      const accountsLabel = removedAccounts
        .map(
          (account) =>
            `${t(`Common.providers.${account.provider}`)} (${account.displayName ?? account.emailAddress ?? t("Common.unnamed")})`,
        )
        .join(", ");

      await this.emailService.send({
        to: admin.email,
        subject: t("AccountsRemovedNotice.subject"),
        react: AccountsRemovedNotice({
          locale,
          layoutCopy,
          greeting: t("AccountsRemovedNotice.greeting", {
            firstName: admin.firstName,
          }),
          body: t("AccountsRemovedNotice.body", {
            accounts: accountsLabel,
            plan: t(`Subscription.planNames.${plan}`),
          }),
          cta: t("AccountsRemovedNotice.cta"),
          signoff: t("AccountsRemovedNotice.signoff"),
          subject: t("AccountsRemovedNotice.subject"),
          title: t("AccountsRemovedNotice.title"),
          href,
        }),
      });
    }
  }
}
