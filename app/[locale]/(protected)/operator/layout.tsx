import type { Metadata } from "next";

import { notFound } from "next/navigation";

import { OperatorUserModal } from "./users/operator-user-modal";
import { OperatorWorkspaceModal } from "./workspaces/operator-workspace-modal";

import { getOperatorConsoleVisibilityInteractor } from "@/core/di";

export const metadata: Metadata = {
  robots: {
    follow: false,
    index: false,
    noarchive: true,
    nosnippet: true,
  },
};

export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  if (!(await getOperatorConsoleVisibilityInteractor().invoke())) notFound();

  return (
    <>
      {children}

      <OperatorUserModal />

      <OperatorWorkspaceModal />
    </>
  );
}
