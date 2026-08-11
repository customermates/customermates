import { redirect } from "next/navigation";

import { CenteredCardPage } from "@/components/shared/centered-card-page";
import { getGetLegalStatusInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";

import { LegalUpdateView } from "./components/legal-update-view";

export default async function LegalUpdatePage() {
  await requireAccess({
    skipLegalAcceptanceCheck: true,
    skipSubscriptionCheck: true,
  });
  const status = await getGetLegalStatusInteractor().invoke();

  if (!status.contractNoticeSent || status.contractAccepted || !status.effectiveAt) redirect("/");

  return (
    <CenteredCardPage className="animate-page-result-in motion-reduce:animate-none">
      <LegalUpdateView status={status} />
    </CenteredCardPage>
  );
}
