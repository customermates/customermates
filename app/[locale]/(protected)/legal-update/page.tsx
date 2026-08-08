import { redirect } from "next/navigation";

import { CenteredCardPage } from "@/components/shared/centered-card-page";
import { getGetLegalStatusInteractor, getUserService } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";

import { LegalUpdateView } from "./components/legal-update-view";

export default async function LegalUpdatePage() {
  await requireAccess({
    skipLegalAcceptanceCheck: true,
    skipSubscriptionCheck: true,
  });
  const user = await getUserService().getActiveUserOrThrow();
  const status = await getGetLegalStatusInteractor().invoke(user);

  if (!status.contractNoticeSent || status.contractAccepted || !status.effectiveAt) redirect("/");

  return (
    <CenteredCardPage>
      <LegalUpdateView status={status} />
    </CenteredCardPage>
  );
}
