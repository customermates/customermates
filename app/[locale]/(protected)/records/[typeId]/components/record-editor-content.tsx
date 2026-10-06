"use client";

import { useId, useState, type ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { Maximize2 } from "lucide-react";
import type { RecordEditorStore } from "./record-editor.store";
import { RecordOperationProgress } from "@/components/records/record-operation-progress";
import { RecordAiAction } from "@/app/components/agent-chat/record-ai-action";
import { AppForm } from "@/components/forms/form-context";
import { AppCard } from "@/components/card/app-card";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { IntlLink, useRouter } from "@/i18n/navigation";
import { runUserAction } from "@/core/errors/report-application-error";
import { RecordDetailPersonalization, RecordDetailLayoutControls } from "./record-detail-personalization";
import { RecordDetailOverview } from "./record-detail-overview";
import { RecordDetailSummary } from "./record-detail-summary";
import { RecordEditorFields } from "./record-editor-fields";
import { RecordEditorActions, RecordPageActions } from "./record-editor-actions";
import { EntityDetailPanels, type EntityDetailPanelLayout } from "@/components/entity-detail/entity-detail-panels";
import { useRecordDeletion } from "./use-record-deletion";
import { RecordActivitiesPanel } from "@/features/messaging/activities/record-activities-panel";
import { Alert } from "@/components/shared/alert";
import { AppLink } from "@/components/shared/app-link";

const RecordEditorRecovery = observer(function RecordEditorRecovery({ store }: { store: RecordEditorStore }) {
  const t = useTranslations();
  if (!store.refreshRequired && !store.conflicts.length) return null;
  const label = (key: string) =>
    store.fields.find((field) => field.id === key)?.label ??
    (key === "assignedUserIds"
      ? t("RecordModel.assignedTo")
      : key === "identities"
        ? t("RecordModel.identityChannels")
        : key === "linkChanges"
          ? t("RecordModel.relationships")
          : key);
  return (
    <div className="px-6 pb-3">
      <div className="space-y-2 rounded-md border border-border bg-muted/50 p-3 text-sm" role="status">
        {store.refreshRequired && !store.staleChange ? (
          <Button
            disabled={store.isLoading}
            size="sm"
            type="button"
            variant="secondary"
            onClick={() => runUserAction(store.refreshRecord)}
          >
            {t("ErrorCard.retry")}
          </Button>
        ) : null}

        {store.refreshRequired && store.staleChange ? (
          <>
            <p>{store.hasUnsavedChanges ? t("RecordModel.recordStaleDraft") : t("RecordModel.recordStale")}</p>

            <Button
              disabled={store.isLoading}
              size="sm"
              type="button"
              variant="secondary"
              onClick={() => runUserAction(store.reloadKeepingChanges)}
            >
              {store.hasUnsavedChanges ? t("RecordModel.recordReloadKeepChanges") : t("RecordModel.recordReload")}
            </Button>
          </>
        ) : null}

        {store.conflicts.length ? (
          <>
            <p>{t("RecordModel.recordConflictFields", { fields: store.conflicts.map(label).join(", ") })}</p>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" type="button" variant="secondary" onClick={() => store.resolveConflicts("draft")}>
                {t("RecordModel.staleKeepDraft")}
              </Button>

              <Button size="sm" type="button" variant="secondary" onClick={() => store.resolveConflicts("latest")}>
                {t("RecordModel.staleLoadLatest")}
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
});

const RecordEditorBody = observer(function RecordEditorBody({
  store,
  layout = "drawer",
  panelLayout,
  renderEditor,
}: {
  store: RecordEditorStore;
  layout?: "drawer" | "page";
  panelLayout?: EntityDetailPanelLayout;
  renderEditor: (child: RecordEditorStore) => ReactNode;
}) {
  const t = useTranslations();
  const params = useSearchParams();
  const router = useRouter();
  const [panel, setPanel] = useState("details");
  const id = useId();
  const deletion = useRecordDeletion({
    sessionKey: store.sessionKey,
    captureSession: store.captureSession,
    canDelete: () =>
      store.presentation.permittedActions.includes("delete") &&
      !store.isLoading &&
      !store.pendingOperationId &&
      !store.refreshRequired &&
      !store.hasRelatedDraft &&
      !store.hasUnsavedChanges,
    onMutating: store.setIsLoading,
    onInvalidated: store.rootStore.recordWorkspaceStore.invalidate,
    onDeleted: store.deletionCompleted,
    onPending: (id) => store.setPendingOperation(id, true),
  });
  const openPage = () => {
    const ref = store.record?.ref;
    if (!ref) return;
    const root = store.rootStore;
    const href = `/records/${ref.typeId}/${ref.recordId}`;
    if (store.isLoading || store.pendingOperationId) {
      root.navigationGuard.tryNavigate(() => router.push(href));
      return;
    }
    store.setWithUnsavedChangesGuard(false);
    root.navigationGuard.tryNavigate(() => {
      if (!root.recordWorkspaceStore.handOffDraft(store, true)) return;
      store.resetForm();
      store.close();
      root.recordWorkspaceStore.close();
      router.push(href);
    });
    store.setWithUnsavedChangesGuard(true);
  };
  const type = store.presentation.model.types.find((type) => type.id === store.presentation.typeId);

  const title = store.record?.fields.find((field) => field.fieldId === type?.primaryFieldId)?.result;
  const name =
    title?.state === "value" && title.value.kind === "text"
      ? title.value.value
      : (type?.label ?? t("RecordModel.record"));
  const hasNotes = store.fields.some((field) => field.valueType === "richText");
  const notices = (
    <>
      {store.record?.protectedKind === "membershipAuthorization" && (
        <div className="px-6 pb-3">
          <Alert color="warning">
            <p className="text-x-sm">
              {t.rich("Common.systemTasks.userPendingAuthorization.alert", {
                link: (chunks) =>
                  store.presentation.systemActions?.includes("manageMembership") ? (
                    <AppLink inheritSize appearance="inline" href="/company/members">
                      {chunks}
                    </AppLink>
                  ) : (
                    <span>{chunks}</span>
                  ),
              })}
            </p>
          </Alert>
        </div>
      )}

      {store.pendingOperationId && (
        <div className="px-6 pb-3">
          <RecordOperationProgress
            operationId={store.pendingOperationId}
            onCompleted={store.operationCompleted}
            onStopped={store.operationStopped}
          />
        </div>
      )}

      <RecordEditorRecovery store={store} />
    </>
  );
  if (layout === "page") {
    return (
      <AppForm id={id} store={store}>
        <RecordPageActions deletion={deletion} formId={id} name={name} store={store} />

        {notices}

        <EntityDetailPanels
          activities={
            store.record ? (
              <div className="p-4">
                <RecordActivitiesPanel
                  key={`${store.record.ref.typeId}:${store.record.ref.recordId}`}
                  viewSyncToUrl
                  record={store.record.ref}
                />
              </div>
            ) : undefined
          }
          details={
            <div className="p-4">
              <RecordDetailOverview renderEditor={renderEditor} store={store} />
            </div>
          }
          initialPanel={params.get("viewSurface") === SURFACE.entityTimeline ? "activities" : "details"}
          notes={
            hasNotes ? (
              <div className="p-4">
                <RecordEditorFields notes store={store} />
              </div>
            ) : undefined
          }
          panelLayout={panelLayout}
          summary={<RecordDetailSummary store={store} />}
        />
      </AppForm>
    );
  }
  return (
    <AppForm id={id} store={store}>
      <AppCard className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border-0 bg-transparent shadow-none">
        <AppCardHeader className="pb-4">
          <h2 className="text-lg font-semibold truncate">
            {store.record ? name : t("RecordModel.newRecord", { type: type?.label ?? t("RecordModel.record") })}
          </h2>
        </AppCardHeader>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-6 pb-3">
          <RecordAiAction
            registerContext
            active={store.isOpen}
            context={{
              reference: store.record
                ? { kind: "record", typeId: store.record.ref.typeId, recordId: store.record.ref.recordId }
                : { kind: "recordType", typeId: store.presentation.typeId },
              label: name,
            }}
          />

          <RecordDetailLayoutControls />

          {store.record && (
            <Button asChild size="sm" variant="ghost">
              <IntlLink
                data-navigation-guard-handled=""
                href={`/records/${store.record.ref.typeId}/${store.record.ref.recordId}`}
                onClick={(event) => {
                  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  store.runAfterChannelDraft(openPage);
                }}
              >
                <Maximize2 className="size-4" />

                {t("RecordModel.openPage")}
              </IntlLink>
            </Button>
          )}
        </div>

        {notices}

        <RecordDetailSummary store={store} />

        <Tabs
          className="flex min-h-0 flex-1 flex-col gap-0"
          value={hasNotes || store.record ? panel : "details"}
          onValueChange={(next) => store.runAfterChannelDraft(() => setPanel(next))}
        >
          {(hasNotes || store.record) && (
            <TabsList
              aria-label={t("EntityDetail.overview")}
              className="h-13 w-full shrink-0 justify-stretch gap-0 rounded-none border-b p-0 group-data-[orientation=horizontal]/tabs:h-13"
              variant="line"
            >
              <TabsTrigger className="h-full rounded-none px-4" value="details">
                {t("EntityDetail.overview")}
              </TabsTrigger>

              {hasNotes && (
                <TabsTrigger className="h-full rounded-none px-4" value="notes">
                  {t("EntityDetail.sections.notes")}
                </TabsTrigger>
              )}

              {store.record && (
                <TabsTrigger className="h-full rounded-none px-4" value="activities">
                  {t("Common.actions.labelHistory")}
                </TabsTrigger>
              )}
            </TabsList>
          )}

          <AppCardBody className="overflow-y-auto overscroll-contain">
            <TabsContent className="m-0 space-y-4" value="details">
              <RecordDetailOverview renderEditor={renderEditor} store={store} />
            </TabsContent>

            {hasNotes && (
              <TabsContent className="m-0" value="notes">
                <RecordEditorFields notes store={store} />
              </TabsContent>
            )}

            {store.record && (
              <TabsContent className="m-0" value="activities">
                <RecordActivitiesPanel
                  key={`${store.record.ref.typeId}:${store.record.ref.recordId}`}
                  record={store.record.ref}
                />
              </TabsContent>
            )}
          </AppCardBody>
        </Tabs>

        {(!store.isReadOnly || (store.record && store.presentation.permittedActions.includes("delete"))) && (
          <AppCardFooter>
            <RecordEditorActions deletion={deletion} formId={id} name={name} store={store} />
          </AppCardFooter>
        )}
      </AppCard>
    </AppForm>
  );
});

export const RecordEditorContent = observer(function RecordEditorContent(props: {
  store: RecordEditorStore;
  layout?: "drawer" | "page";
  panelLayout?: EntityDetailPanelLayout;
  renderEditor: (child: RecordEditorStore) => ReactNode;
}) {
  return (
    <RecordDetailPersonalization key={props.store.presentation.typeId} store={props.store}>
      <RecordEditorBody {...props} />
    </RecordDetailPersonalization>
  );
});
