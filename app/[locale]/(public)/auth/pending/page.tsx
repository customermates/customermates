import { PendingCard } from "./pending-card";

import { CenteredCardPage } from "@/components/shared/centered-card-page";
import { requireAccountState } from "@/features/auth/next/require";

export default async function PendingPage() {
  await requireAccountState("pending");

  return (
    <CenteredCardPage>
      <PendingCard />
    </CenteredCardPage>
  );
}
