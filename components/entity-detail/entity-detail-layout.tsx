"use client";

import type { ReactNode } from "react";
import type { BaseFormStore } from "@/core/base/base-form.store";
import type {
  BaseCustomColumnEntityModalStore,
  EntityDto,
  FormEntityDto,
} from "@/core/base/base-custom-column-entity-modal.store";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Action, CustomColumnType, EntityType, Resource } from "@/generated/prisma";

import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { AppForm } from "@/components/forms/form-context";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/shared/icon";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { useRouter } from "@/i18n/navigation";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/core/utils/cn";
import { PageState } from "@/components/page-state/page-state";
import { useEntityDrawerStack } from "@/components/entity-detail/hooks/use-entity-drawer-stack";

import { EntityNotesPanel } from "./entity-notes-panel";
import { EntityDetailPageSkeleton } from "./entity-detail-page-skeleton";
import { resolveEntityDetailPageState } from "./entity-detail-page-state";
import { ENTITY_URL_SEGMENT } from "./entity-relations";

type IdentityProps = {
  name: string;
  pictureUrl?: string | null;
};

export type EntityDetailInitial = {
  entity: EntityDto;
  customColumns: CustomColumnDto[];
};

type Props<Form extends FormEntityDto, Dto extends EntityDto> = {
  entityId: string;
  entityType: EntityType;
  entityInitial?: EntityDetailInitial | null;
  store: BaseCustomColumnEntityModalStore<Form, Dto>;
  masterData: ReactNode;
  identity: IdentityProps;
  fallbackTitle: string;
  canDelete?: boolean;
  historyPanel: ReactNode;
};

export const EntityDetailLayout = observer(function EntityDetailLayout<
  Form extends FormEntityDto,
  Dto extends EntityDto,
>({
  entityId,
  entityType,
  entityInitial,
  store,
  masterData,
  identity,
  fallbackTitle,
  canDelete = true,
  historyPanel,
}: Props<Form, Dto>) {
  const t = useTranslations();
  const router = useRouter();
  const { layoutStore, customColumnModalStore, userStore } = useRootStore();
  const { stack: entityDrawerStack } = useEntityDrawerStack();
  const { showDeleteConfirmation } = useDeleteConfirmation();
  const [hasMounted, setHasMounted] = useState(false);
  const formId = useId();
  const drawerWasOpenRef = useRef(entityDrawerStack.length > 0);
  const seededEntityId = useRef<string | null>(null);

  if (entityInitial?.entity.id === entityId && seededEntityId.current !== entityId) {
    seededEntityId.current = entityId;
    store.hydrate(entityInitial.entity as Dto, entityInitial.customColumns);
  }

  useEffect(() => {
    if (seededEntityId.current === entityId) return;
    void store.loadById(entityId);
  }, [entityId, store]);

  useEffect(() => {
    const drawerIsOpen = entityDrawerStack.length > 0;
    const drawerWasOpen = drawerWasOpenRef.current;
    drawerWasOpenRef.current = drawerIsOpen;

    if (drawerWasOpen && !drawerIsOpen && store.fetchedEntity?.id !== entityId) void store.loadById(entityId);
  }, [entityDrawerStack.length, entityId, store]);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const { canManage, isLoading, isEditingCustomField, toggleEditingCustomField, form } = store;
  const hasId = form && typeof form === "object" && "id" in form && Boolean(form.id);
  const canSeeHistory = userStore.can(Resource.auditLog, Action.readAll);
  const showDeleteAction = canManage && hasId && canDelete && !isEditingCustomField;
  const saveDisabled = isLoading || !store.hasUnsavedChanges || store.isDisabled;
  const hasCurrentEntity = store.fetchedEntity?.id === entityId;
  const requestMatches = store.requestedEntityId === entityId;
  const pageState = resolveEntityDetailPageState({
    hasCurrentEntity,
    requestMatches,
    requestState: store.entityLoadState,
  });
  const showLoadError = pageState === "error" || pageState === "not-found";
  const showLoading = pageState === "loading";
  const showEditFieldsAction = canManage && !isEditingCustomField;
  const showEditFieldsActiveActions = canManage && isEditingCustomField;

  useEffect(() => {
    const key = `${ENTITY_URL_SEGMENT[entityType]}:${entityId}`;
    if (hasCurrentEntity) {
      const avatarKind =
        entityType === EntityType.contact ? "contact" : entityType === EntityType.organization ? "organization" : null;
      layoutStore.setRuntimeIdentity({
        scope: "entity",
        key,
        title: identity.name,
        pictureUrl: avatarKind ? (identity.pictureUrl ?? null) : null,
        avatarKind,
      });
    } else if (showLoadError) {
      layoutStore.setRuntimeIdentity({
        scope: "entity",
        key,
        title: fallbackTitle,
        pictureUrl: null,
        avatarKind: null,
      });
    }

    return () => layoutStore.clearRuntimeIdentity("entity", key);
  }, [
    entityId,
    identity.name,
    identity.pictureUrl,
    entityType,
    fallbackTitle,
    hasCurrentEntity,
    layoutStore,
    showLoadError,
  ]);

  const deleteConfirmationRef = useRef(showDeleteConfirmation);
  deleteConfirmationRef.current = showDeleteConfirmation;
  const onDelete = useCallback(() => {
    deleteConfirmationRef.current(async () => {
      const ok = await store.delete();
      if (ok) router.push(`/${ENTITY_URL_SEGMENT[entityType]}`);
    });
  }, [store, router, entityType]);
  const onAddCustomField = useCallback(() => {
    customColumnModalStore.initialize(CustomColumnType.plain, entityType);
    customColumnModalStore.open();
  }, [customColumnModalStore, entityType]);

  const topBarActions = useMemo(
    () =>
      showLoading || showLoadError ? null : (
        <TooltipProvider>
          <div className="flex items-center gap-1">
            {showDeleteAction && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label={t("Common.actions.delete")}
                    className="size-8"
                    disabled={isLoading}
                    id="entity-delete"
                    size="icon"
                    type="button"
                    variant="secondary"
                    onClick={onDelete}
                  >
                    <Icon className="text-destructive" icon={Trash2} />
                  </Button>
                </TooltipTrigger>

                <TooltipContent>{t("Common.actions.delete")}</TooltipContent>
              </Tooltip>
            )}

            {showEditFieldsAction && (
              <Button
                className="h-8"
                id="entity-edit-fields"
                size="sm"
                type="button"
                variant="secondary"
                onClick={toggleEditingCustomField}
              >
                <Icon icon={Pencil} />

                <span className="hidden sm:inline">{t("Common.actions.editCustomFields")}</span>
              </Button>
            )}

            {showEditFieldsActiveActions && (
              <>
                <Button className="h-8" size="sm" type="button" variant="secondary" onClick={toggleEditingCustomField}>
                  {t("Common.actions.cancel")}
                </Button>

                <Button
                  className="h-8"
                  id="entity-add-custom-field"
                  size="sm"
                  type="button"
                  variant="secondary"
                  onClick={onAddCustomField}
                >
                  <Icon icon={Plus} />

                  <span className="hidden sm:inline">{t("Common.actions.addCustomField")}</span>
                </Button>
              </>
            )}

            {canManage && store.hasUnsavedChanges && (
              <Button
                className="h-8"
                disabled={isLoading}
                id="entity-reset"
                size="sm"
                type="button"
                variant="secondary"
                onClick={() => store.resetForm()}
              >
                {t("Common.actions.reset")}
              </Button>
            )}

            {canManage && (
              <Button className="h-8" disabled={saveDisabled} form={formId} id="entity-save" size="sm" type="submit">
                {t("Common.actions.save")}
              </Button>
            )}
          </div>
        </TooltipProvider>
      ),
    [
      showLoading,
      showLoadError,
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

  switch (pageState) {
    case "loading":
      return <PageState background={<EntityDetailPageSkeleton />} label={t("PageState.loading")} state="loading" />;
    case "not-found":
      return (
        <PageState
          description={t("PageState.notFoundDescription")}
          state="error"
          title={t("PageState.notFoundTitle")}
        />
      );
    case "error":
      return (
        <PageState
          action={
            <Button size="sm" variant="secondary" onClick={() => void store.loadById(entityId)}>
              {t("ErrorCard.retry")}
            </Button>
          }
          description={t("ErrorCard.contactSupport")}
          state="error"
          title={t("ErrorCard.title")}
        />
      );
    case "content":
      break;
    default: {
      const exhaustive: never = pageState;
      return exhaustive;
    }
  }

  return (
    <AppForm id={formId} store={store as unknown as BaseFormStore}>
      <div className="@container/detail animate-page-result-in flex min-h-0 w-full flex-1 flex-col overflow-y-auto motion-reduce:animate-none @4xl/detail:overflow-y-visible">
        <div
          className={cn(
            "grid grid-cols-1 gap-px bg-border contain-[layout]",
            "@4xl/detail:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] @4xl/detail:flex-1 @4xl/detail:min-h-0",
            canSeeHistory && "@6xl/detail:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_360px]",
          )}
        >
          <div className="flex flex-col bg-background @4xl/detail:min-h-0 @4xl/detail:overflow-auto">
            <div className="p-4 @4xl/detail:flex-1 @4xl/detail:min-h-0">
              {masterData}

              {isEditingCustomField && canManage && (
                <Button className="w-full mt-4" size="sm" type="button" variant="default" onClick={onAddCustomField}>
                  <Icon icon={Plus} />

                  {t("Common.actions.addCustomField")}
                </Button>
              )}
            </div>
          </div>

          {canSeeHistory ? (
            <div className="flex flex-col gap-px bg-border @4xl/detail:min-h-0 @6xl/detail:contents">
              <div className="flex flex-col bg-background @4xl/detail:flex-2 @4xl/detail:min-h-0 @4xl/detail:overflow-hidden">
                <EntityNotesPanel key={entityId} store={store} />
              </div>

              {hasMounted && (
                <div className="flex flex-col bg-background @4xl/detail:flex-1 @4xl/detail:min-h-0 @4xl/detail:overflow-hidden">
                  {historyPanel}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col bg-background @4xl/detail:min-h-0 @4xl/detail:overflow-hidden">
              <EntityNotesPanel key={entityId} store={store} />
            </div>
          )}
        </div>
      </div>
    </AppForm>
  );
});
