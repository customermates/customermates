import { ErrorTestCard } from "./error-test-card";

import { CenteredCardPage } from "@/components/shared/centered-card-page";
import { requireAccess } from "@/features/auth/next/require";

export default async function ErrorTestPage() {
  await requireAccess();
  return (
    <CenteredCardPage>
      <ErrorTestCard />
    </CenteredCardPage>
  );
}
