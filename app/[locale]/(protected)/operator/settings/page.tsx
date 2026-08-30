import type { Metadata } from "next";

import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { OperatorSettingsView } from "./operator-settings-view";

import { PageContainer } from "@/components/shared/page-container";
import { getHostedAiOperatorOverviewInteractor, getOperatorConsoleVisibilityInteractor } from "@/core/di";
import { appErrorDetails } from "@/core/errors/app-errors";
import { env } from "@/env";

export async function generateMetadata(): Promise<Metadata> {
  const robots = { follow: false, index: false, noarchive: true, nosnippet: true };
  if (!(await getOperatorConsoleVisibilityInteractor().invoke())) return { robots };

  const t = await getTranslations("OperatorSettings");

  return { title: t("title"), description: t("description"), robots };
}

export default async function OperatorSettingsPage() {
  try {
    const overview = await getHostedAiOperatorOverviewInteractor().invoke();

    return (
      <PageContainer>
        <OperatorSettingsView
          control={overview.globalControl}
          controlsEnabled={env.HOSTED_AI_OPERATOR_CONTROLS_ENABLED}
        />
      </PageContainer>
    );
  } catch (error) {
    if (appErrorDetails(error)) notFound();
    throw error;
  }
}
