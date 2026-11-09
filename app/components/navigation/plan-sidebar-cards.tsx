"use client";

import type { ComponentProps } from "react";

import { TRIAL_END_WINDOW_DAYS } from "@/core/commercial/plan-fit";
import { usePlanFit } from "@/app/components/upsell/use-plan-fit";
import { usePlanUsage } from "@/app/components/upsell/use-plan-usage";

import { FreePlanSidebarCard, TrialSidebarCard } from "./trial-sidebar-card";

export function TrialSidebarCardWithFit(props: Omit<ComponentProps<typeof TrialSidebarCard>, "fit">) {
  const fit = usePlanFit(props.daysLeft <= TRIAL_END_WINDOW_DAYS);

  return <TrialSidebarCard {...props} fit={fit} />;
}

export function FreePlanSidebarCardWithUsage(props: Omit<ComponentProps<typeof FreePlanSidebarCard>, "usage">) {
  const usage = usePlanUsage(true);

  return <FreePlanSidebarCard {...props} usage={usage} />;
}
