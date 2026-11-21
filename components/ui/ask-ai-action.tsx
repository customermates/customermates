"use client";

import { useTranslations } from "next-intl";

import type { AppModalButtonActionProps } from "@/components/modal/app-modal-action";

import { MateIcon } from "@/components/mate/mate-icon";
import { AppModalAction } from "@/components/modal/app-modal-action";
import { TopBarActionButton } from "@/components/shared/top-bar-action-buttons";

export function AskAiAction({
  id,
  placement = "overlay",
  onClick,
}: {
  id?: string;
  placement?: "overlay" | "topbar";
  onClick: () => void | Promise<void>;
}) {
  const action = useAskAiAction()({ anchorId: id, onClick });
  return placement === "topbar" ? <TopBarActionButton action={action} /> : <AppModalAction {...action} />;
}

export function useAskAiAction() {
  const t = useTranslations();

  return ({
    anchorId,
    onClick,
  }: {
    anchorId?: string;
    onClick: () => void | Promise<void>;
  }): AppModalButtonActionProps => ({
    id: "ask-ai",
    kind: "assistant",
    anchorId,
    icon: MateIcon,
    label: t("DataView.views.askAi"),
    onClick,
  });
}
