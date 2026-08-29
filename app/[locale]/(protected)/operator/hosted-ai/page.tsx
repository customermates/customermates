import type { Metadata } from "next";

import { randomUUID } from "node:crypto";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { HostedAiOperatorConsole } from "./operator-console";

import {
  getHostedAiOperatorOverviewInteractor,
  getOperatorConsoleVisibilityInteractor,
  listOperatorAuditEventsInteractor,
} from "@/core/di";
import { appErrorDetails } from "@/core/errors/app-errors";
import { env } from "@/env";

export async function generateMetadata(): Promise<Metadata> {
  const robots = { follow: false, index: false, noarchive: true, nosnippet: true };
  if (!env.OPERATOR_CONSOLE_ENABLED || !(await getOperatorConsoleVisibilityInteractor().invoke())) return { robots };

  const t = await getTranslations("OperatorConsole");
  return {
    title: t("title"),
    description: t("description"),
    robots,
  };
}

export default async function HostedAiOperatorPage() {
  try {
    const [overview, audit] = await Promise.all([
      getHostedAiOperatorOverviewInteractor().invoke(),
      listOperatorAuditEventsInteractor().invoke({ limit: 50 }),
    ]);

    return (
      <HostedAiOperatorConsole
        audit={audit}
        globalControlsEnabled={env.HOSTED_AI_OPERATOR_CONTROLS_ENABLED}
        initialOperationIds={{
          adjustment: randomUUID(),
          allowance: randomUUID(),
          globalControl: randomUUID(),
        }}
        overview={overview}
      />
    );
  } catch (error) {
    if (appErrorDetails(error)) notFound();
    throw error;
  }
}
