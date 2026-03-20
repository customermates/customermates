"use client";

import React from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { PlusIcon } from "@heroicons/react/24/outline";

import { XCard } from "@/components/x-card/x-card";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XIcon } from "@/components/x-icon";
import { useRootStore } from "@/core/stores/root-store.provider";

export const WidgetAddCard = observer(() => {
  const t = useTranslations("");

  const { widgetModalStore } = useRootStore();

  return (
    <XCard disableRipple isPressable onPress={() => void widgetModalStore.add()}>
      <XCardBody>
        <div className="flex h-full w-full flex-col space-y-3 items-center justify-center">
          <XIcon icon={PlusIcon} />

          <p className="text-x-sm text-gray-500 text-center">{t("Dashboard.addCard")}</p>
        </div>
      </XCardBody>
    </XCard>
  );
});
