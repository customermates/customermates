import { getLocale } from "next-intl/server";

import { AppShell } from "./components/navigation/app-shell";

import { NotFoundPageView } from "@/components/shared/not-found-page-view";

export default async function NotFoundPage() {
  return (
    <AppShell displayLanguage={await getLocale()}>
      <NotFoundPageView />
    </AppShell>
  );
}
