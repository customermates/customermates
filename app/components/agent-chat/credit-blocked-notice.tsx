"use client";

import { useTranslations } from "next-intl";
import {} from "lucide-react";

import type { AgentUsageSummary } from "@/ee/agent-chat/agent-usage.service";

import { useRouter } from "@/i18n/navigation";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { Button } from "@/components/ui/button";

export function CreditBlockedNotice({ usage }: { usage: AgentUsageSummary }) {
  const intlStore = useHydratedIntlStore();
  const t = useTranslations();
  const router = useRouter();
  const reason = usage.blockedReason ?? "credits_exhausted";
  const resetAt = intlStore.formatDescriptiveShortDate(new Date(usage.resetAt));
  const contact = reason === "enterprise_allowance_missing" || reason === "configuration_unavailable";

  return (
    <div className="flex items-start justify-between gap-3 px-1 py-2" role="status">
      <p className="text-sm text-muted-foreground">{t(`AgentChat.credits.blocked.${reason}`, { resetAt })}</p>

      <Button
        className="shrink-0"
        size="sm"
        variant="secondary"
        onClick={() => {
          if (contact) window.location.assign("mailto:support@customermates.com?subject=Hosted%20Assistant%20credits");
          else router.push("/company/subscription");
        }}
      >
        {contact ? t("AgentChat.credits.contact") : t("AgentChat.credits.viewPlans")}
      </Button>
    </div>
  );
}
