import type { Metadata } from "next";

import { notFound } from "next/navigation";

import { PageContainer } from "@/components/shared/page-container";
import { getOperatorConsoleVisibilityInteractor } from "@/core/di";
import { env } from "@/env";
import { OperatorNavigation } from "./operator-navigation";

export const metadata: Metadata = {
  robots: {
    follow: false,
    index: false,
    noarchive: true,
    nosnippet: true,
  },
};

export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  if (!env.OPERATOR_CONSOLE_ENABLED || !(await getOperatorConsoleVisibilityInteractor().invoke())) notFound();

  return (
    <PageContainer>
      <OperatorNavigation />

      {children}
    </PageContainer>
  );
}
