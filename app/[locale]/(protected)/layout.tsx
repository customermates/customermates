import { getLocale } from "next-intl/server";

import { ProtectedShell } from "./protected-shell";

import { AppShell } from "@/app/components/navigation/app-shell";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell displayLanguage={await getLocale()}>
      <ProtectedShell>{children}</ProtectedShell>
    </AppShell>
  );
}
