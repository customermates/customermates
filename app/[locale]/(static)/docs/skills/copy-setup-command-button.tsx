"use client";

import { ClipboardIcon } from "@heroicons/react/24/outline";
import { Button } from "@heroui/button";
import { addToast } from "@heroui/toast";
import { useTranslations } from "next-intl";

import { XIcon } from "@/components/x-icon";

type Props = {
  value: string;
};

export function CopySetupCommandButton({ value }: Props) {
  const t = useTranslations("");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      addToast({
        description: t("SkillsPage.agentSetupToast"),
        color: "success",
        icon: <XIcon icon={ClipboardIcon} size="sm" />,
      });
    } catch {
      addToast({
        description: t("Common.notifications.copyFailed"),
        color: "danger",
      });
    }
  }

  return (
    <Button
      color="primary"
      endContent={<XIcon icon={ClipboardIcon} size="sm" />}
      size="sm"
      variant="flat"
      onPress={() => void handleCopy()}
    >
      {t("SkillsPage.copy")}
    </Button>
  );
}
