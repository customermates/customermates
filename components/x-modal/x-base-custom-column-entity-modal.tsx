"use client";

import type { ReactNode } from "react";
import type { BaseModalStore } from "@/core/base/base-modal.store";
import type { BaseFormStore } from "@/core/base/base-form.store";
import type {
  BaseCustomColumnEntityModalStore,
  EntityDto,
  FormEntityDto,
} from "@/core/base/base-custom-column-entity-modal.store";

import { Button, ButtonGroup } from "@heroui/button";
import {
  PencilSquareIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  ViewColumnsIcon,
  CircleStackIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import Cookies from "js-cookie";

import { CustomColumnType } from "@/generated/prisma";
import { Action, Resource } from "@/generated/prisma";
import type { EntityType } from "@/generated/prisma";

import { AssigneeGuardModal } from "@/app/components/assignee-guard-modal";
import { XCard } from "@/components/x-card/x-card";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XCardHeader } from "@/components/x-card/x-card-header";
import { XCardModalDefaultFooter } from "@/components/x-card/x-card-modal-default-footer";
import { XEditor } from "@/components/x-editor/x-editor";
import { XForm } from "@/components/x-inputs/x-form";
import { XIcon } from "@/components/x-icon";
import { XModal } from "@/components/x-modal/x-modal";
import { XTooltip } from "@/components/x-tooltip";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useDeleteConfirmation } from "@/components/x-modal/hooks/x-use-delete-confirmation";

enum EntityModalViewMode {
  masterData = "masterData",
  notes = "notes",
  sideBySide = "sideBySide",
}

type Props<Form extends FormEntityDto, Dto extends EntityDto> = {
  store: BaseCustomColumnEntityModalStore<Form, Dto>;
  entityType: EntityType;
  titleKey: string;
  children: ReactNode;
  canDelete?: boolean;
};

const COOKIE_NAME = "entityModalViewMode";

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia(query);
    function handler(event: MediaQueryListEvent) {
      return setMatches(event.matches);
    }

    mediaQuery.addEventListener("change", handler);
    setMatches(mediaQuery.matches);

    return () => mediaQuery.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

export const XBaseCustomColumnEntityModal = observer(
  <Form extends FormEntityDto, Dto extends EntityDto>({
    store,
    entityType,
    titleKey,
    children,
    canDelete = true,
  }: Props<Form, Dto>) => {
    const t = useTranslations("");
    const isLargeScreen = useMediaQuery("(min-width: 1024px)");
    const rootStore = useRootStore();

    const [viewMode, setViewMode] = useState<EntityModalViewMode>(() => {
      const saved = Cookies.get(COOKIE_NAME);
      if (saved && Object.values(EntityModalViewMode).includes(saved as EntityModalViewMode))
        return saved as EntityModalViewMode;

      return isLargeScreen ? EntityModalViewMode.sideBySide : EntityModalViewMode.masterData;
    });

    useEffect(() => {
      if (!isLargeScreen && viewMode === EntityModalViewMode.sideBySide) setViewMode(EntityModalViewMode.masterData);
    }, [isLargeScreen, viewMode]);

    function handleViewModeChange(mode: EntityModalViewMode) {
      setViewMode(mode);
      Cookies.set(COOKIE_NAME, mode, { expires: 365 });
    }

    const { canManage } = store;
    const { xCustomColumnModalStore, entityHistoryModalStore, userStore } = useRootStore();
    const { showDeleteConfirmation } = useDeleteConfirmation();

    const { form, isLoading, isEditingCustomField, toggleEditingCustomField } = store;
    const hasId = form && typeof form === "object" && "id" in form && form.id;

    const modalSize = viewMode === EntityModalViewMode.sideBySide ? "4xl" : "lg";
    const showMasterData = viewMode === EntityModalViewMode.masterData || viewMode === EntityModalViewMode.sideBySide;
    const showNotes = viewMode === EntityModalViewMode.notes || viewMode === EntityModalViewMode.sideBySide;

    function handleNotesChange(data: object) {
      store.onChange("notes", data);
    }

    return (
      <>
        <XModal size={modalSize} store={store as unknown as BaseModalStore}>
          <XForm store={store as unknown as BaseFormStore}>
            <XCard>
              <XCardHeader>
                <h2 className="text-x-lg grow">{t(titleKey)}</h2>

                <div className="flex items-center gap-2">
                  {isEditingCustomField ? (
                    <ButtonGroup size="sm" variant="flat">
                      <XTooltip content={t("Common.actions.cancel")}>
                        <Button onPress={toggleEditingCustomField}>{t("Common.actions.cancel")}</Button>
                      </XTooltip>

                      <Button
                        color="primary"
                        startContent={<XIcon icon={PlusIcon} />}
                        onPress={() => {
                          xCustomColumnModalStore.initialize(CustomColumnType.plain, entityType);
                          xCustomColumnModalStore.open();
                        }}
                      >
                        {t("Common.actions.addCustomField")}
                      </Button>
                    </ButtonGroup>
                  ) : (
                    <>
                      <ButtonGroup size="sm" variant="flat">
                        <XTooltip content={t("Common.actions.showMasterData")}>
                          <Button
                            isIconOnly
                            aria-label={t("Common.actions.showMasterData")}
                            color={viewMode === EntityModalViewMode.masterData ? "primary" : "default"}
                            onPress={() => handleViewModeChange(EntityModalViewMode.masterData)}
                          >
                            <XIcon icon={CircleStackIcon} />
                          </Button>
                        </XTooltip>

                        <XTooltip content={t("Common.actions.showNotes")}>
                          <Button
                            isIconOnly
                            aria-label={t("Common.actions.showNotes")}
                            color={viewMode === EntityModalViewMode.notes ? "primary" : "default"}
                            onPress={() => handleViewModeChange(EntityModalViewMode.notes)}
                          >
                            <XIcon icon={PencilSquareIcon} />
                          </Button>
                        </XTooltip>

                        {isLargeScreen && (
                          <XTooltip content={t("Common.actions.showSideBySide")}>
                            <Button
                              isIconOnly
                              aria-label={t("Common.actions.showSideBySide")}
                              color={viewMode === EntityModalViewMode.sideBySide ? "primary" : "default"}
                              onPress={() => handleViewModeChange(EntityModalViewMode.sideBySide)}
                            >
                              <XIcon icon={ViewColumnsIcon} />
                            </Button>
                          </XTooltip>
                        )}
                      </ButtonGroup>

                      {rootStore.isCloudHosted && hasId && userStore.can(Resource.auditLog, Action.readAll) && (
                        <XTooltip content={t("Common.actions.showHistory")}>
                          <div>
                            <Button
                              isIconOnly
                              color="primary"
                              size="sm"
                              variant="flat"
                              onPress={() => {
                                if (typeof form.id === "string") void entityHistoryModalStore.loadByEntityId(form.id);
                              }}
                            >
                              <XIcon icon={ClockIcon} />
                            </Button>
                          </div>
                        </XTooltip>
                      )}

                      {canManage && (
                        <ButtonGroup size="sm" variant="flat">
                          <XTooltip content={t("Common.actions.editCustomFields")}>
                            <Button isIconOnly color="primary" onPress={toggleEditingCustomField}>
                              <XIcon icon={PencilIcon} />
                            </Button>
                          </XTooltip>

                          {hasId && canDelete && (
                            <XTooltip content={t("Common.actions.delete")}>
                              <Button
                                isIconOnly
                                color="danger"
                                isDisabled={isLoading}
                                onPress={() => showDeleteConfirmation(() => void store.delete())}
                              >
                                <XIcon icon={TrashIcon} />
                              </Button>
                            </XTooltip>
                          )}
                        </ButtonGroup>
                      )}
                    </>
                  )}
                </div>
              </XCardHeader>

              <XCardBody>
                {viewMode === EntityModalViewMode.sideBySide ? (
                  <div className="grid grid-cols-7 gap-6">
                    {showMasterData && (
                      <div className="col-span-3 flex flex-col gap-4 sticky top-0 self-start">{children}</div>
                    )}

                    {showNotes && (
                      <div className="col-span-4 flex flex-col gap-4 sticky top-0 self-start h-full">
                        <XEditor data={form.notes} onChange={handleNotesChange} />
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {showMasterData && children}

                    {showNotes && <XEditor data={form.notes} onChange={handleNotesChange} />}
                  </>
                )}
              </XCardBody>

              <XCardModalDefaultFooter store={store as unknown as BaseModalStore} />
            </XCard>
          </XForm>
        </XModal>

        <AssigneeGuardModal store={store as unknown as BaseModalStore} />
      </>
    );
  },
);
