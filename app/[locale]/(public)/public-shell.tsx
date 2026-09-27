"use client";

import { Toaster } from "@/components/ui/sonner";

import { LoadingOverlay } from "@/components/shared/loading-overlay";
import { UnexpectedErrorToaster } from "@/components/shared/unexpected-error-toaster";
import { TranslationSync } from "@/components/shared/translation-sync";

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}

      <Toaster />

      <LoadingOverlay />

      <UnexpectedErrorToaster />

      <TranslationSync />
    </>
  );
}
