import { redirect } from "next/navigation";

import { RestrictedWorkspaceSwitch } from "@/app/components/workspaces/restricted-workspace-switch";
import { CenteredCardPage } from "@/components/shared/centered-card-page";
import { requireAccountState } from "@/features/auth/next/require";

import { LegalUpdateView } from "./components/legal-update-view";

export default async function LegalUpdatePage() {
  const resolution = await requireAccountState(["allowed", "legal"]);
  const status = resolution.legalStatus;

  if (!status || !status.contractNoticeSent || status.contractAccepted || !status.effectiveAt) redirect("/");

  return (
    <CenteredCardPage className="animate-page-result-in motion-reduce:animate-none">
      <div className="flex w-full flex-col items-center gap-4">
        <LegalUpdateView status={status} />

        <RestrictedWorkspaceSwitch />
      </div>
    </CenteredCardPage>
  );
}
