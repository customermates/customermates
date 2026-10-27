import type { Metadata } from "next";

import { notFound } from "next/navigation";

import { ProtectedFrame } from "../w/[workspace]/protected-frame";

import { getGetOperatorConsoleVisibilityInteractor } from "@/core/di";

export const metadata: Metadata = {
  robots: {
    follow: false,
    index: false,
    noarchive: true,
    nosnippet: true,
  },
};

export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  if (!(await getGetOperatorConsoleVisibilityInteractor().invoke())) notFound();

  return <ProtectedFrame>{children}</ProtectedFrame>;
}
