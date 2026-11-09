"use client";

import type { PurchasablePlanId } from "@/core/commercial/plan-catalog";

import { useTranslations } from "next-intl";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { assistantSurfaceProps } from "@/components/modal/assistant-surface";
import { OVERLAY_RAISED_PANEL_LAYER_CLASS } from "@/components/ui/overlay-contract";
import { cn } from "@/core/utils/cn";
import { freeUpgradeHighlights } from "@/app/components/upsell/plan-upsell-highlights";
import { UpsellHighlights } from "@/app/components/upsell/upsell-highlights";
import { UpsellCta } from "@/app/components/upsell/upsell-cta";
import { UpsellMatePreview } from "@/app/components/upsell/upsell-mate-preview";
import { UpsellPlanPrice } from "@/app/components/upsell/upsell-plan-price";

type Props = {
  plan: PurchasablePlanId;
  onClose: () => void;
};

export function AgentUpgradePanel({ plan, onClose }: Props) {
  const t = useTranslations();
  const title = t("Upsell.locked.mate.title");
  const surface = assistantSurfaceProps({
    right: "max(1rem, var(--safe-right))",
    bottom: "max(1rem, var(--safe-bottom))",
  });

  return (
    <div
      {...surface}
      aria-label={title}
      className={cn(
        "fixed flex max-h-[calc(100dvh-2rem)] w-[400px] max-w-[calc(100dvw-2rem)] flex-col gap-4 overflow-y-auto rounded-2xl border bg-card p-5",
        OVERLAY_RAISED_PANEL_LAYER_CLASS,
        "shadow-2xl shadow-scrim/25 dark:shadow-scrim/80 dark:ring-1 dark:ring-border",
      )}
      data-locked-feature=""
      data-testid="agent-upgrade-panel"
      id="agent-panel-dialog"
      role="dialog"
      tabIndex={-1}
    >
      <Button
        aria-label={t("Common.actions.close")}
        className="absolute top-2 right-2 size-7"
        size="icon"
        variant="ghost"
        onClick={onClose}
      >
        <X className="size-4" />
      </Button>

      <span className="flex flex-col gap-1.5 pr-8">
        <span className="text-xs font-medium text-muted-foreground">
          <UpsellPlanPrice plan={plan} />
        </span>

        <h2 className="text-x-xl text-balance">{title}</h2>
      </span>

      <UpsellMatePreview />

      <p className="text-x-sm text-subdued">{t("Upsell.locked.mate.description")}</p>

      <UpsellHighlights items={freeUpgradeHighlights(plan, t)} />

      <UpsellCta plan={plan} onNavigate={onClose} />
    </div>
  );
}
