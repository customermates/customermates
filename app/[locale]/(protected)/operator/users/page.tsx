import type { Metadata } from "next";

import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { OperatorUsersConsole } from "./operator-users-console";

import {
  getOperatorConsoleVisibilityInteractor,
  getOperatorUserSummaryInteractor,
  listOperatorUsersInteractor,
} from "@/core/di";
import { appErrorDetails } from "@/core/errors/app-errors";
import { env } from "@/env";

export async function generateMetadata(): Promise<Metadata> {
  const robots = { follow: false, index: false, noarchive: true, nosnippet: true };
  if (!env.OPERATOR_CONSOLE_ENABLED || !(await getOperatorConsoleVisibilityInteractor().invoke())) return { robots };

  const t = await getTranslations("OperatorUsers");
  return {
    title: t("title"),
    description: t("description"),
    robots,
  };
}

export default async function OperatorUsersPage() {
  try {
    const [summary, initialPage] = await Promise.all([
      getOperatorUserSummaryInteractor().invoke(),
      listOperatorUsersInteractor().invoke({ limit: 25, sort: "newest" }),
    ]);

    return <OperatorUsersConsole initialPage={initialPage} summary={summary} />;
  } catch (error) {
    if (appErrorDetails(error)) notFound();
    throw error;
  }
}
