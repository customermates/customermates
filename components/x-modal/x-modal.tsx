"use client";

import type { ModalProps } from "@heroui/modal";
import type { ReactNode } from "react";
import type { BaseModalStore } from "@/core/base/base-modal.store";

import { Modal, ModalContent } from "@heroui/modal";
import { XMarkIcon } from "@heroicons/react/24/outline";
import React from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { XIcon } from "../x-icon";
import { XTooltip } from "../x-tooltip";

import { XNavigationGuardModal } from "./x-navigation-guard-modal";

type Props = ModalProps & {
  store?: BaseModalStore;
  children: ReactNode;
};

export const XModal = observer(({ children, store, onClose, ...props }: Props) => {
  const t = useTranslations("Common");

  function handleClose() {
    if (store?.withUnsavedChangesGuard && store?.hasUnsavedChanges) store.setIsClosingWithGuard(true);
    else {
      if (onClose) onClose();
      else store?.close();
    }
  }

  return (
    <>
      <Modal
        classNames={{
          backdrop: "bg-overlay/20",
        }}
        closeButton={false}
        hideCloseButton={false}
        isOpen={store?.isOpen ?? false}
        scrollBehavior="inside"
        size="lg"
        onClose={handleClose}
        {...props}
      >
        <ModalContent className="relative">
          {({}) => (
            <>
              <XTooltip content={t("actions.close")} placement="right">
                <button
                  aria-label={t("ariaLabels.close")}
                  className="absolute top-0 right-0 sm:translate-x-[115%] -translate-y-[115%] sm:translate-y-0 cursor-pointer outline-transparent box-border text-small bg-content1 rounded-full shadow-medium p-3 select-none z-10"
                  tabIndex={-1}
                  type="button"
                  onClick={handleClose}
                >
                  <XIcon icon={XMarkIcon} size="sm" />
                </button>
              </XTooltip>

              {children}
            </>
          )}
        </ModalContent>
      </Modal>

      {store && (
        <XNavigationGuardModal
          open={store.isClosingWithGuard}
          onCancel={() => store.setIsClosingWithGuard(false)}
          onConfirm={() => store.close()}
        />
      )}
    </>
  );
});
