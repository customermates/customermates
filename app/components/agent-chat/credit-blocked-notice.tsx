"use client";

import { useTranslations } from "next-intl";

import type { AgentUsageView } from "@/ee/agent-chat/agent-usage.service";

import { useRouter } from "@/i18n/navigation";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { Button } from "@/components/ui/button";
import { settingsHref } from "@/app/components/navigation/settings-routes";
import { contactHref } from "@/core/utils/contact-href";

export function CreditBlockedNotice({ usage }: { usage: AgentUsageView }) {
  const intlStore = useHydratedIntlStore();
  const t = useTranslations();
  const router = useRouter();
  const reason = usage.blockedReason ?? "credits_exhausted";
  const resetAt = intlStore.formatDescriptiveShortDate(new Date(usage.resetAt));
  const contact = reason === "configuration_unavailable";

  return (
    <div className="flex items-start justify-between gap-3 px-1 py-2" role="status">
      <p className="text-sm text-muted-foreground">{t(`AgentChat.credits.blocked.${reason}`, { resetAt })}</p>

      <Button
        className="shrink-0"
        size="sm"
        variant="secondary"
        onClick={() => {
          const supportHref = contact ? contactHref("email", "support@customermates.com") : null;
          if (supportHref) window.location.assign(`${supportHref}?subject=Hosted%20Assistant%20credits`);
          else router.push(settingsHref("billing"));
        }}
      >
        {contact ? t("AgentChat.credits.contact") : t("AgentChat.credits.viewPlans")}
      </Button>
    </div>
  );
}
