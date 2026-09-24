import { getLocale } from "next-intl/server";

import { PublicShell } from "./public-shell";

import { AppShell } from "@/app/components/navigation/app-shell";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell displayLanguage={await getLocale()}>
      <PublicShell>{children}</PublicShell>
    </AppShell>
  );
}
