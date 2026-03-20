"use client";

import { ToastProvider } from "@heroui/toast";

import { XLoadingOverlay } from "@/components/x-loading-overlay";
import { XUnexpectedErrorToaster } from "@/components/x-unexpected-error-toaster";
import { XTranslationSync } from "@/components/x-translation-sync";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}

      <ToastProvider />

      <XLoadingOverlay />

      <XUnexpectedErrorToaster />

      <XTranslationSync />
    </>
  );
}
