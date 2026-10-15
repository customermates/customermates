import { PendingCard } from "./pending-card";

import { RestrictedWorkspaceSwitch } from "@/app/components/workspaces/restricted-workspace-switch";
import { CenteredCardPage } from "@/components/shared/centered-card-page";
import { requireAccountState } from "@/features/auth/next/require";
import { NOINDEX_METADATA } from "@/core/seo/noindex-metadata";

export const metadata = NOINDEX_METADATA;

export default async function PendingPage() {
  await requireAccountState("pending");

  return (
    <CenteredCardPage>
      <div className="flex w-full flex-col items-center gap-4">
        <PendingCard />

        <RestrictedWorkspaceSwitch />
      </div>
    </CenteredCardPage>
  );
}
