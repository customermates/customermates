import { PendingCard } from "./pending-card";

import { CenteredCardPage } from "@/components/shared/centered-card-page";
import { requireAccountState } from "@/features/auth/next/require";
import { NOINDEX_METADATA } from "@/core/seo/noindex-metadata";

export const metadata = NOINDEX_METADATA;

export default async function PendingPage() {
  await requireAccountState("pending");

  return (
    <CenteredCardPage>
      <PendingCard />
    </CenteredCardPage>
  );
}
