"use client";

import type { ReactNode } from "react";
import type { BaseFormStore } from "@/core/base/base-form.store";
import type {
  BaseCustomColumnEntityModalStore,
  EntityDto,
  FormEntityDto,
} from "@/core/base/base-custom-column-entity-modal.store";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { observer } from "mobx-react-lite";
import { Check, Pencil, RotateCcw, Save, Settings2, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Action, EntityType, Resource } from "@/generated/prisma";

import { useSetTopBarActions, useSetTopBarJoinedContent } from "@/app/components/topbar-actions-context";
import { AppForm } from "@/components/forms/form-context";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { useRouter } from "@/i18n/navigation";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/core/utils/cn";
import { PageState } from "@/components/page-state/page-state";
import { useEntityDrawerStack } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";

import { EntityNotesPanel } from "./entity-notes-panel";
import { EntityDetailPageSkeleton } from "./entity-detail-page-skeleton";
import { resolveEntityDetailPageState } from "./entity-detail-page-state";
import { ENTITY_URL_SEGMENT } from "./entity-relations";
import { useEntityDetailPersonalization } from "./entity-detail-personalization";

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
  store: BaseCustomColumnEntityModalStore<Form, Dto>;
  masterData: ReactNode;
  identity: IdentityProps;
  fallbackTitle: string;
  canDelete?: boolean;
  historyPanel: ReactNode;
  summary?: ReactNode;
  showNotesPanel?: boolean;
  serverSnapshotApplied?: boolean;
};

type DetailPanel = "details" | "notes" | "activities";

export const EntityDetailLayout = observer(function EntityDetailLayout<
  Form extends FormEntityDto,
  Dto extends EntityDto,
>({
  entityId,
  entityType,
  store,
  masterData,
  identity,
  fallbackTitle,
  canDelete = true,
  historyPanel,
  summary,
  showNotesPanel = true,
  serverSnapshotApplied = true,
}: Props<Form, Dto>) {
  const t = useTranslations();
  const router = useRouter();
  const { layoutStore, userStore } = useRootStore();
  const { stack: entityDrawerStack } = useEntityDrawerStack();
  const { showDeleteConfirmation } = useDeleteConfirmation();
  const {
    enabled: canPersonalize,
    isPersonalizing,
    setIsPersonalizing,
    starredFieldIds,
  } = useEntityDetailPersonalization();
  const [hasMounted, setHasMounted] = useState(false);
  const [activePanel, setActivePanel] = useState<DetailPanel>("details");
  const formId = useId();
  const drawerWasOpenRef = useRef(entityDrawerStack.length > 0);
  useEffect(() => {
    const drawerIsOpen = entityDrawerStack.length > 0;
    const drawerWasOpen = drawerWasOpenRef.current;
    drawerWasOpenRef.current = drawerIsOpen;

    if (drawerWasOpen && !drawerIsOpen && store.fetchedEntity?.id !== entityId)
      void store.loadById(entityId).catch(reportApplicationError);
  }, [entityDrawerStack.length, entityId, store]);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const { canManage, isLoading, isEditingCustomField, toggleEditingCustomField, form } = store;
  const hasId = form && typeof form === "object" && "id" in form && Boolean(form.id);
  const canSeeHistory = userStore.can(Resource.auditLog, Action.readAll);
  const selectedPanel =
    (activePanel === "notes" && !showNotesPanel) || (activePanel === "activities" && !canSeeHistory)
      ? "details"
      : activePanel;
  const showDeleteAction = canManage && hasId && canDelete && !isEditingCustomField;
  const saveDisabled = isLoading || !store.hasUnsavedChanges || store.isDisabled;
  const hasCurrentEntity = serverSnapshotApplied && store.fetchedEntity?.id === entityId;
  const requestMatches = serverSnapshotApplied && store.requestedEntityId === entityId;
  const pageState = resolveEntityDetailPageState({
    hasCurrentEntity,
    requestMatches,
    requestState: store.entityLoadState,
  });
  const showLoadError = pageState === "error" || pageState === "not-found";
  const showLoading = pageState === "loading";
  const isCustomizing = canPersonalize && (isPersonalizing || (canManage && isEditingCustomField));
  const showEditFieldsAction = !canPersonalize && canManage && !isEditingCustomField;
  const showEditFieldsActiveActions = canManage && isEditingCustomField;
  const hasSummary = Boolean(summary) && (!canPersonalize || starredFieldIds.length > 0);
  const joinsTopBar = hasSummary && (pageState === "loading" || pageState === "content");

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
      return ok;
    });
  }, [store, router, entityType]);
  const onToggleCustomization = useCallback(() => {
    const next = !isCustomizing;
    setIsPersonalizing(next);
    if (canManage && isEditingCustomField !== next) toggleEditingCustomField();
  }, [canManage, isCustomizing, isEditingCustomField, setIsPersonalizing, toggleEditingCustomField]);

  const topBarActions = useMemo(
    () =>
      showLoading || showLoadError ? null : (
        <div className="flex items-center gap-1">
          {canPersonalize && (
            <Button
              data-entity-customize
              aria-label={isCustomizing ? t("EntityDetail.donePersonalizing") : t("EntityDetail.personalize")}
              aria-pressed={isCustomizing}
              className="h-8"
              size="sm"
              type="button"
              variant={isCustomizing ? "default" : "secondary"}
              onClick={onToggleCustomization}
            >
              {isCustomizing ? (
                <Check aria-hidden="true" className="size-4 sm:hidden" />
              ) : (
                <Settings2 aria-hidden="true" className="size-4 sm:hidden" />
              )}

              <span className="hidden sm:inline">
                {isCustomizing ? t("EntityDetail.donePersonalizing") : t("EntityDetail.personalize")}
              </span>
            </Button>
          )}

          {showDeleteAction && (
            <Button
              aria-label={t("Common.actions.delete")}
              className="h-8 text-destructive hover:text-destructive"
              disabled={isLoading}
              id="entity-delete"
              size="sm"
              type="button"
              variant="secondary"
              onClick={onDelete}
            >
              <Trash2 aria-hidden="true" className="size-4 sm:hidden" />

              <span className="hidden sm:inline">{t("Common.actions.delete")}</span>
            </Button>
          )}

          {showEditFieldsAction && (
            <Button
              aria-label={t("Common.actions.editCustomFields")}
              className="h-8"
              id="entity-edit-fields"
              size="sm"
              type="button"
              variant="secondary"
              onClick={toggleEditingCustomField}
            >
              <Pencil aria-hidden="true" className="size-4 sm:hidden" />

              <span className="hidden sm:inline">{t("Common.actions.editCustomFields")}</span>
            </Button>
          )}

          {showEditFieldsActiveActions && !canPersonalize && (
            <Button
              aria-label={t("Common.actions.cancel")}
              className="h-8"
              size="sm"
              type="button"
              variant="secondary"
              onClick={toggleEditingCustomField}
            >
              <X aria-hidden="true" className="size-4 sm:hidden" />

              <span className="hidden sm:inline">{t("Common.actions.cancel")}</span>
            </Button>
          )}

          {canManage && store.hasUnsavedChanges && (
            <Button
              aria-label={t("Common.actions.reset")}
              className="h-8"
              disabled={isLoading}
              id="entity-reset"
              size="sm"
              type="button"
              variant="secondary"
              onClick={() => store.resetForm()}
            >
              <RotateCcw aria-hidden="true" className="size-4 sm:hidden" />

              <span className="hidden sm:inline">{t("Common.actions.reset")}</span>
            </Button>
          )}

          {canManage && (
            <Button
              aria-label={t("Common.actions.save")}
              className="h-8"
              disabled={saveDisabled}
              form={formId}
              id="entity-save"
              size="sm"
              type="submit"
            >
              <Save aria-hidden="true" className="size-4 sm:hidden" />

              <span className="hidden sm:inline">{t("Common.actions.save")}</span>
            </Button>
          )}
        </div>
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
      formId,
      store,
      store.hasUnsavedChanges,
      canPersonalize,
      isCustomizing,
      onToggleCustomization,
    ],
  );

  useSetTopBarActions(topBarActions);
  useSetTopBarJoinedContent(joinsTopBar);

  switch (pageState) {
    case "loading":
      return (
        <PageState
          background={
            <EntityDetailPageSkeleton
              showActivityPanel={canSeeHistory}
              showNotesPanel={showNotesPanel}
              showSummary={hasSummary}
              summaryItemCount={Math.max(1, Math.min(starredFieldIds.length, 5))}
            />
          }
          label={t("PageState.loading")}
          state="loading"
        />
      );
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
            <Button size="sm" variant="secondary" onClick={() => runUserAction(() => store.loadById(entityId))}>
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
      <div className="@container/detail flex min-h-0 w-full flex-1 flex-col">
        <div className="animate-page-result-in flex min-h-0 w-full flex-1 flex-col overflow-y-auto motion-reduce:animate-none @6xl/detail:overflow-y-visible">
          {hasSummary ? summary : null}

          {(showNotesPanel || canSeeHistory) && (
            <div
              data-detail-panel-switcher
              className="sticky top-0 z-10 border-b border-border bg-background @6xl/detail:hidden"
            >
              <Tabs value={selectedPanel} onValueChange={(value) => setActivePanel(value as DetailPanel)}>
                <TabsList
                  aria-label={t("Common.details")}
                  className="h-13 w-full justify-stretch gap-0 rounded-none p-0 group-data-[orientation=horizontal]/tabs:h-13"
                  variant="line"
                >
                  <TabsTrigger
                    aria-controls={`${formId}-details-panel`}
                    className="h-full rounded-none px-4 after:-bottom-px after:z-10"
                    id={`${formId}-details-tab`}
                    value="details"
                  >
                    {t("Common.details")}
                  </TabsTrigger>

                  {showNotesPanel && (
                    <TabsTrigger
                      aria-controls={`${formId}-notes-panel`}
                      className="h-full rounded-none px-4 after:-bottom-px after:z-10"
                      id={`${formId}-notes-tab`}
                      value="notes"
                    >
                      {t("EntityDetail.sections.notes")}
                    </TabsTrigger>
                  )}

                  {canSeeHistory && (
                    <TabsTrigger
                      aria-controls={`${formId}-activities-panel`}
                      className="h-full rounded-none px-4 after:-bottom-px after:z-10"
                      id={`${formId}-activities-tab`}
                      value="activities"
                    >
                      {t("EntityTimeline.types.activities")}
                    </TabsTrigger>
                  )}
                </TabsList>
              </Tabs>
            </div>
          )}

          <div
            data-detail-grid
            className={cn(
              "grid grid-cols-1 gap-px bg-border contain-[layout]",
              "@6xl/detail:flex-1 @6xl/detail:min-h-0",
              showNotesPanel && canSeeHistory && "@6xl/detail:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_360px]",
              showNotesPanel && !canSeeHistory && "@6xl/detail:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]",
              !showNotesPanel && canSeeHistory && "@6xl/detail:grid-cols-[minmax(0,1fr)_360px]",
            )}
          >
            <div
              aria-labelledby={`${formId}-details-tab`}
              className={cn(
                "flex flex-col bg-background",
                selectedPanel !== "details" && "hidden",
                "@6xl/detail:flex @6xl/detail:min-h-0 @6xl/detail:overflow-x-hidden @6xl/detail:overflow-y-auto",
              )}
              data-detail-panel="details"
              id={`${formId}-details-panel`}
              role="tabpanel"
            >
              <div className="p-4 @6xl/detail:flex-1 @6xl/detail:min-h-0">{masterData}</div>
            </div>

            {showNotesPanel && (
              <div
                aria-labelledby={`${formId}-notes-tab`}
                className={cn(
                  "min-h-[28rem] flex-col bg-background",
                  selectedPanel === "notes" ? "flex" : "hidden",
                  "@6xl/detail:flex @6xl/detail:min-h-0 @6xl/detail:overflow-hidden",
                )}
                data-detail-panel="notes"
                id={`${formId}-notes-panel`}
                role="tabpanel"
              >
                <EntityNotesPanel key={entityId} store={store} />
              </div>
            )}

            {hasMounted && canSeeHistory && (
              <div
                aria-labelledby={`${formId}-activities-tab`}
                className={cn(
                  "min-h-[28rem] flex-col bg-background",
                  selectedPanel === "activities" ? "flex" : "hidden",
                  "@6xl/detail:flex @6xl/detail:min-h-0 @6xl/detail:overflow-hidden",
                )}
                data-detail-panel="activities"
                id={`${formId}-activities-panel`}
                role="tabpanel"
              >
                {historyPanel}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppForm>
  );
});
