import { redirect } from "next/navigation";

import { CenteredCardPage } from "@/components/shared/centered-card-page";
import { requireAccountState } from "@/features/auth/next/require";

import { LegalUpdateView } from "./components/legal-update-view";

export default async function LegalUpdatePage() {
  const resolution = await requireAccountState(["allowed", "legal"]);
  const status = resolution.legalStatus;

  if (!status || !status.contractNoticeSent || status.contractAccepted || !status.effectiveAt) redirect("/");

  return (
    <CenteredCardPage className="animate-page-result-in motion-reduce:animate-none">
      <LegalUpdateView status={status} />
    </CenteredCardPage>
  );
}
