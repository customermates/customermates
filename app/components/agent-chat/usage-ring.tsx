"use client";

import { observer } from "mobx-react-lite";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { useAgentChatStore } from "./agent-chat-store-context";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export const UsageRing = observer(function UsageRing() {
  const store = useAgentChatStore();
  const intlStore = useHydratedIntlStore();
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  if (!store.usage) return null;
  const usage = store.usage;
  if (usage.creditsLimit <= 0) return null;
  const pct = usage.usedPct;
  const resetAt = intlStore.formatDayMonth(new Date(usage.resetAt));
  const circumference = 2 * Math.PI * 7;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={t("AgentChat.credits.usage", { pct })}
        className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="agent-usage"
        id="agent-usage"
        onMouseEnter={() => setOpen(true)}
      >
        <svg className="-rotate-90 size-5" viewBox="0 0 18 18">
          <circle className="stroke-muted" cx="9" cy="9" fill="none" r="7" strokeWidth="3" />

          <circle
            className="stroke-primary"
            cx="9"
            cy="9"
            fill="none"
            r="7"
            strokeDasharray={`${(circumference * Math.min(100, pct)) / 100} ${circumference}`}
            strokeLinecap="round"
            strokeWidth="3"
          />
        </svg>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-64 space-y-1 p-3 text-xs text-muted-foreground"
        side="top"
        onMouseLeave={() => setOpen(false)}
      >
        <p className="font-medium text-foreground tabular-nums">
          {t("AgentChat.credits.remaining", {
            remaining: usage.creditsRemaining,
            limit: usage.creditsLimit,
          })}
        </p>

        <p>
          {usage.plan
            ? t("AgentChat.credits.planAndReset", {
                plan: t(`Subscription.planNames.${usage.plan}`),
                resetAt,
              })
            : t("AgentChat.credits.resetShort", { resetAt })}
        </p>

        {usage.recentTurnCredits !== null && (
          <p>{t("AgentChat.credits.recentTurn", { credits: usage.recentTurnCredits })}</p>
        )}
      </PopoverContent>
    </Popover>
  );
});
