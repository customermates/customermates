"use client";

import type { AppMode } from "@/core/config/environment";

import { MarketingShell } from "@/app/components/navigation/marketing-shell";
import { LoadingOverlay } from "@/components/shared/loading-overlay";
import { TranslationSync } from "@/components/shared/translation-sync";
import { UnexpectedErrorToaster } from "@/components/shared/unexpected-error-toaster";
import { Toaster } from "@/components/ui/sonner";

export function EntryShell({ appMode, children }: { appMode: AppMode; children: React.ReactNode }) {
  return (
    <>
      <MarketingShell appMode={appMode}>{children}</MarketingShell>

      <Toaster />

      <LoadingOverlay />

      <UnexpectedErrorToaster />

      <TranslationSync />
    </>
  );
}
