"use client";

import dynamic from "next/dynamic";
import { observer } from "mobx-react-lite";

import { Toaster } from "@/components/ui/sonner";

import { LoadingOverlay } from "@/components/shared/loading-overlay";
import { UnexpectedErrorToaster } from "@/components/shared/unexpected-error-toaster";
import { TranslationSync } from "@/components/shared/translation-sync";
import { useRootStore } from "@/core/stores/root-store.provider";

const CreateWorkspaceModal = dynamic(
  () => import("@/app/components/workspaces/create-workspace-modal").then((mod) => mod.CreateWorkspaceModal),
  { ssr: false },
);

const MemberModals = observer(() => {
  const { workspacesStore } = useRootStore();

  return workspacesStore.items.length > 0 ? <CreateWorkspaceModal /> : null;
});

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}

      <Toaster />

      <LoadingOverlay />

      <UnexpectedErrorToaster />

      <TranslationSync />

      <MemberModals />
    </>
  );
}
