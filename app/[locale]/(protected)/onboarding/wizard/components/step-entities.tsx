"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Box, Sparkles } from "lucide-react";
import { SalesType } from "@/generated/prisma";

import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/lib/utils";

const CHOICES = [
  {
    value: SalesType.product,
    icon: Box,
    tint: "bg-amber-500/10 text-amber-500 dark:bg-amber-400/10 dark:text-amber-400",
  },
  {
    value: SalesType.service,
    icon: Sparkles,
    tint: "bg-violet-500/10 text-violet-500 dark:bg-violet-400/10 dark:text-violet-400",
  },
] as const;

export const StepEntities = observer(function StepEntities() {
  const t = useTranslations("OnboardingWizard.entities");
  const { onboardingWizardStore } = useRootStore();
  const selected = onboardingWizardStore.salesType;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">{t("intro")}</p>

      <div className="grid gap-2 sm:grid-cols-2">
        {CHOICES.map(({ value, icon: Icon, tint }) => {
          const active = selected === value;
          return (
            <button
              key={value}
              aria-pressed={active}
              className={cn(
                "flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors",
                active ? "border-primary bg-primary/5" : "bg-card hover:border-foreground/30",
              )}
              type="button"
              onClick={() => onboardingWizardStore.setSalesType(value)}
            >
              <div className={`flex size-9 items-center justify-center rounded-md ${tint}`}>
                <Icon className="size-4" />
              </div>

              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium">{t(`${value}.title`)}</div>

                <div className="text-xs text-muted-foreground">{t(`${value}.description`)}</div>

                <div className="text-xs italic text-muted-foreground">{t(`${value}.example`)}</div>
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">{t("outro")}</p>
    </div>
  );
});
