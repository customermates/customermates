"use client";

import type { ThemeChoice } from "./nav-user";

import { useTheme } from "next-themes";

import { signOutAction } from "@/app/[locale]/actions";
import { FeedbackType } from "@/features/feedback/send-feedback.schema";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

export function useAccountActions(restricted = false) {
  const { companyInviteModalStore, feedbackModalStore, userStore } = useRootStore();
  const { theme, setTheme } = useTheme();
  return {
    theme,
    changeTheme: (next: ThemeChoice) => {
      setTheme(next);
      if (!restricted) runUserAction(() => userStore.updateTheme(next));
    },
    signOut: () =>
      runUserAction(async () => {
        const result = await signOutAction();
        if (!result.ok) toastZodErrorTree(result.error);
      }),
    inviteMembers: () => {
      runUserAction(() => companyInviteModalStore.generateInviteLink());
      companyInviteModalStore.open();
    },
    sendFeedback: (invoker: HTMLElement, fallback?: HTMLElement | null) => {
      feedbackModalStore.onInitOrRefresh({ type: FeedbackType.general, feedback: "" });
      feedbackModalStore.openFrom(invoker, fallback);
    },
  };
}
