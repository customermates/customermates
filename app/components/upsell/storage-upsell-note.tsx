"use client";

import type { PlanId } from "@/core/commercial/plan-catalog";

import { useTranslations } from "next-intl";

import { IntlLink } from "@/i18n/navigation";
import { useRecordFileSize } from "@/components/records/record-file-meta";
import { billingHref } from "@/app/components/navigation/settings-routes";
import { PLAN_CATALOG } from "@/core/commercial/plan-catalog";
import { nextStoragePlan } from "@/core/commercial/plan-fit";

import { useCanChangePlan } from "./use-can-change-plan";
import { supportMailHref } from "@/app/[locale]/(protected)/w/[workspace]/settings/(workspace)/components/subscription/support-mail-href";

type Props = {
  plan: PlanId | null;
};

export function StorageUpsellNote({ plan }: Props) {
  const t = useTranslations();
  const sizeLabel = useRecordFileSize();
  const canChangePlan = useCanChangePlan();
  const next = nextStoragePlan(plan);

  if (!next) {
    const href = supportMailHref(t("Upsell.storage.supportSubject"));

    return (
      <span className="flex flex-wrap items-baseline gap-x-1.5" data-storage-upsell="support">
        <span>{t("Upsell.storage.topPlan")}</span>

        {href ? (
          <a className="text-foreground underline underline-offset-2" href={href}>
            {t("CheckoutPending.contactSupport")}
          </a>
        ) : null}
      </span>
    );
  }

  const perUser = PLAN_CATALOG[next].entitlements.fileStorageBytesPerActiveUser;
  const planName = t(`Subscription.planNames.${next}`);

  return (
    <span className="flex flex-wrap items-baseline gap-x-1.5" data-storage-upsell={next}>
      <span>
        {t("Upsell.storage.nextPlan", { plan: planName, size: typeof perUser === "number" ? sizeLabel(perUser) : "" })}
      </span>

      {canChangePlan ? (
        <IntlLink className="text-foreground underline underline-offset-2" href={billingHref(next)}>
          {t("Subscription.picker.choose", { plan: planName })}
        </IntlLink>
      ) : (
        <span data-upsell-ask-admin="">{t("Upsell.askAdmin", { plan: planName })}</span>
      )}
    </span>
  );
}
