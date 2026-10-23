import { ErrorTestCard } from "./error-test-card";

import { CenteredCardPage } from "@/components/shared/centered-card-page";
import { requireAccess } from "@/features/auth/next/require";

type Props = { searchParams: Promise<{ render?: string }> };

export default async function ErrorTestPage({ searchParams }: Props) {
  await requireAccess();

  const { render } = await searchParams;
  if (render === "throw") throw new Error("Test server component render error");

  return (
    <CenteredCardPage>
      <ErrorTestCard />
    </CenteredCardPage>
  );
}
