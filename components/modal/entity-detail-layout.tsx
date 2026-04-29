"use client";

import type { ReactNode } from "react";
import type { BaseFormStore } from "@/core/base/base-form.store";
import type { BaseModalStore } from "@/core/base/base-modal.store";
import type {
  BaseCustomColumnEntityModalStore,
  EntityDto,
  FormEntityDto,
} from "@/core/base/base-custom-column-entity-modal.store";

import { Pencil, SquarePen, Plus, Trash2 } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Action, CustomColumnType, EntityType, Resource } from "@/generated/prisma";

import { AssigneeGuardModal } from "@/app/components/assignee-guard-modal";
import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { AppForm } from "@/components/forms/form-context";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/shared/icon";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { useRouter } from "@/i18n/navigation";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/lib/utils";

import { EntityAuditLogPanel } from "./entity-audit-log-panel";
import { EntityNotesPanel } from "./entity-notes-panel";

type IdentityProps = {
  /** Used to drive the topbar breadcrumb via `layoutStore.runtimeTitle`. */
  name: string;
};

const LIST_HREF_BY_ENTITY: Record<EntityType, string> = {
  [EntityType.contact]: "/contacts",
  [EntityType.organization]: "/organizations",
  [EntityType.deal]: "/deals",
  [EntityType.service]: "/services",
  [EntityType.task]: "/tasks",
};

type Props<Form extends FormEntityDto, Dto extends EntityDto> = {
  entityId: string;
  entityType: EntityType;
  store: BaseCustomColumnEntityModalStore<Form, Dto>;
  masterData: ReactNode;
  identity: IdentityProps;
  canDelete?: boolean;
};

export const EntityDetailLayout = observer(function EntityDetailLayout<
  Form extends FormEntityDto,
  Dto extends EntityDto,
>({ entityId, entityType, store, masterData, identity, canDelete = true }: Props<Form, Dto>) {
  const t = useTranslations("");
  const router = useRouter();
  const rootStore = useRootStore();
  const { layoutStore, customColumnModalStore, userStore } = rootStore;
  const { showDeleteConfirmation } = useDeleteConfirmation();
  const [hasMounted, setHasMounted] = useState(false);
  const formId = useId();

  useEffect(() => {
    void store.loadById(entityId);
  }, [entityId, store]);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    layoutStore.setRuntimeTitle(identity.name);
    return () => layoutStore.setRuntimeTitle(null);
  }, [identity.name, layoutStore]);

  const { canManage, isLoading, isEditingCustomField, toggleEditingCustomField, form } = store;
  const hasId = form && typeof form === "object" && "id" in form && Boolean(form.id);
  const canSeeHistory = rootStore.isCloudHosted && userStore.can(Resource.auditLog, Action.readAll);
  const showDeleteAction = canManage && hasId && canDelete && !isEditingCustomField;
  const saveDisabled = isLoading || !store.hasUnsavedChanges || store.isDisabled;
  const showLoading = store.isLoading && !store.fetchedEntity;
  const showEditFieldsAction = canManage && !isEditingCustomField;
  const showEditFieldsActiveActions = canManage && isEditingCustomField;

  const deleteConfirmationRef = useRef(showDeleteConfirmation);
  deleteConfirmationRef.current = showDeleteConfirmation;
  const onDelete = useCallback(() => {
    deleteConfirmationRef.current(async () => {
      const ok = await store.delete();
      if (ok) router.push(LIST_HREF_BY_ENTITY[entityType]);
    });
  }, [store, router, entityType]);
  const onAddCustomField = useCallback(() => {
    customColumnModalStore.initialize(CustomColumnType.plain, entityType);
    customColumnModalStore.open();
  }, [customColumnModalStore, entityType]);

  const topBarActions = useMemo(
    () =>
      showLoading ? null : (
        <TooltipProvider>
          <div className="flex items-center gap-1">
            {showDeleteAction && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label={t("Common.actions.delete")}
                    className="size-8"
                    disabled={isLoading}
                    size="icon"
                    type="button"
                    variant="outline"
                    onClick={onDelete}
                  >
                    <Icon className="text-destructive" icon={Trash2} />
                  </Button>
                </TooltipTrigger>

                <TooltipContent>{t("Common.actions.delete")}</TooltipContent>
              </Tooltip>
            )}

            {showEditFieldsAction && (
              <Button className="h-8" size="sm" type="button" variant="outline" onClick={toggleEditingCustomField}>
                <Icon icon={Pencil} />

                <span className="hidden sm:inline">{t("Common.actions.editCustomFields")}</span>
              </Button>
            )}

            {showEditFieldsActiveActions && (
              <>
                <Button className="h-8" size="sm" type="button" variant="ghost" onClick={toggleEditingCustomField}>
                  {t("Common.actions.cancel")}
                </Button>

                <Button className="h-8" size="sm" type="button" variant="outline" onClick={onAddCustomField}>
                  <Icon icon={Plus} />

                  <span className="hidden sm:inline">{t("Common.actions.addCustomField")}</span>
                </Button>
              </>
            )}

            {canManage && store.hasUnsavedChanges && (
              <Button
                className="h-8"
                disabled={isLoading}
                size="sm"
                type="button"
                variant="outline"
                onClick={() => store.resetForm()}
              >
                {t("Common.actions.reset")}
              </Button>
            )}

            {canManage && (
              <Button className="h-8" disabled={saveDisabled} form={formId} size="sm" type="submit">
                {t("Common.actions.save")}
              </Button>
            )}
          </div>
        </TooltipProvider>
      ),
    [
      showLoading,
      t,
      canManage,
      showDeleteAction,
      isLoading,
      saveDisabled,
      onDelete,
      showEditFieldsAction,
      showEditFieldsActiveActions,
      toggleEditingCustomField,
      onAddCustomField,
      formId,
      store,
      store.hasUnsavedChanges,
    ],
  );

  useSetTopBarActions(topBarActions);

  if (showLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <AppForm id={formId} store={store as unknown as BaseFormStore}>
      <div className="flex flex-col w-full flex-1 min-h-0 overflow-y-auto xl:overflow-y-visible">
        <div
          className={cn(
            "grid grid-cols-1 md:grid-cols-2 gap-px bg-border",
            canSeeHistory
              ? "xl:flex-1 xl:min-h-0 xl:grid-cols-[1fr_1fr_360px]"
              : "md:flex-1 md:min-h-0 md:grid-rows-1 xl:grid-cols-2",
          )}
        >
          <div className="flex flex-col bg-background xl:min-h-0 xl:overflow-auto">
            <div className="flex items-center gap-2 px-4 pt-3 pb-1 shrink-0 min-h-8">
              <Icon className="size-3.5 text-muted-foreground" icon={SquarePen} />

              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("Common.actions.labelData")}
              </span>
            </div>

            <div className="p-4 pt-2 xl:flex-1 xl:min-h-0">
              {masterData}

              {isEditingCustomField && canManage && (
                <Button className="w-full mt-4" size="sm" type="button" variant="default" onClick={onAddCustomField}>
                  <Icon icon={Plus} />

                  {t("Common.actions.addCustomField")}
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-col bg-background xl:min-h-0 xl:overflow-hidden">
            <EntityNotesPanel key={entityId} store={store} />
          </div>

          {canSeeHistory && (
            <div className="md:col-span-2 xl:col-span-1 flex flex-col bg-background xl:min-h-0 xl:overflow-hidden">
              {hasMounted && (
                <EntityAuditLogPanel key={entityId} entityId={entityId} refreshKey={store.fetchedEntity} />
              )}
            </div>
          )}
        </div>
      </div>

      <AssigneeGuardModal store={store as unknown as BaseModalStore} />
    </AppForm>
  );
});
