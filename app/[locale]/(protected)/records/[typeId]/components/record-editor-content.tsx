"use client";

import { useId, useState, type ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { SURFACE } from "@/core/data-view/data-view-keys";
import type { RecordEditorStore } from "./record-editor.store";
import { RecordOperationProgress } from "@/components/records/record-operation-progress";
import { AppForm } from "@/components/forms/form-context";
import { AppCard } from "@/components/card/app-card";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppCardBody } from "@/components/card/app-card-body";
import { Button } from "@/components/ui/button";
import { SegmentedControl, SegmentedControlPanel } from "@/components/ui/segmented-control";
import { usePathname, useRouter } from "@/i18n/navigation";
import { runUserAction } from "@/core/errors/report-application-error";
import {
  RecordDetailLayoutStatus,
  RecordDetailPersonalization,
  useRecordDetailLayout,
} from "./record-detail-personalization";
import { RecordDetailOverview } from "./record-detail-overview";
import { RecordDetailSummary } from "./record-detail-summary";
import { RecordEditorFields } from "./record-editor-fields";
import { RecordEditorActions, RecordHeaderActions, RecordPageActions } from "./record-editor-actions";
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
  const pathname = usePathname();
  const router = useRouter();
  const detailLayout = useRecordDetailLayout();
  const id = useId();
  const deletion = useRecordDeletion({
    sessionKey: store.sessionKey,
    captureSession: store.captureSession,
    canDelete: () => store.presentation.permittedActions.includes("delete") && !store.isBusy,
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
      if (pathname !== href) router.push(href);
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
        <div className="flex shrink-0 items-start pr-[3.125rem]">
          <AppCardHeader className="min-w-0 flex-1 pr-4! pb-4">
            <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">
              {store.record ? name : t("RecordModel.newRecord", { type: type?.label ?? t("RecordModel.record") })}
            </h2>
          </AppCardHeader>

          <RecordHeaderActions
            className="mt-1.5"
            deletion={deletion}
            layout={detailLayout}
            name={name}
            store={store}
            onOpenPage={(event) => {
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              store.runAfterChannelDraft(openPage);
            }}
          />
        </div>

        {detailLayout && <RecordDetailLayoutStatus {...detailLayout} className="shrink-0 px-6 pb-3" />}

        {notices}

        <RecordDetailSummary store={store} />

        <RecordDrawerSegments
          label={t("EntityDetail.overview")}
          segments={[
            {
              value: "details",
              label: t("EntityDetail.overview"),
              fields: [
                ...store.fields.filter((field) => field.valueType !== "richText").map((field) => `values.${field.id}`),
                "assignedUserIds",
                "identities",
              ],
              content: (
                <AppCardBody className="space-y-4 overflow-y-auto overscroll-contain">
                  <RecordDetailOverview renderEditor={renderEditor} store={store} />
                </AppCardBody>
              ),
            },
            ...(hasNotes
              ? [
                  {
                    value: "notes",
                    label: t("EntityDetail.sections.notes"),
                    fields: store.fields
                      .filter((field) => field.valueType === "richText")
                      .map((field) => `values.${field.id}`),
                    content: (
                      <AppCardBody className="overflow-y-auto overscroll-contain">
                        <RecordEditorFields notes store={store} />
                      </AppCardBody>
                    ),
                  },
                ]
              : []),
            ...(store.record
              ? [
                  {
                    value: "activities",
                    label: t("Common.actions.labelHistory"),
                    content: (
                      <AppCardBody className="overflow-y-auto overscroll-contain">
                        <RecordActivitiesPanel
                          key={`${store.record.ref.typeId}:${store.record.ref.recordId}`}
                          record={store.record.ref}
                        />
                      </AppCardBody>
                    ),
                  },
                ]
              : []),
          ]}
          store={store}
        />

        <RecordEditorActions formId={id} store={store} />
      </AppCard>
    </AppForm>
  );
});

const DRAWER_SEGMENT_KEY = "editor-tab:record-drawer";

type DrawerSegment = { value: string; label: ReactNode; fields?: readonly string[]; content: ReactNode };

function readDrawerSegment() {
  try {
    return window.localStorage.getItem(DRAWER_SEGMENT_KEY);
  } catch {
    return null;
  }
}

function rememberDrawerSegment(value: string) {
  try {
    window.localStorage.setItem(DRAWER_SEGMENT_KEY, value);
  } catch {}
}

const RecordDrawerSegments = observer(function RecordDrawerSegments({
  store,
  segments,
  label,
}: {
  store: RecordEditorStore;
  segments: readonly DrawerSegment[];
  label: string;
}) {
  const t = useTranslations();
  const [chosen, setChosen] = useState(readDrawerSegment);
  const active = segments.find((segment) => segment.value === chosen)?.value ?? segments[0]?.value ?? "";
  if (segments.length < 2) return <div className="flex min-h-0 flex-1 flex-col">{segments[0]?.content}</div>;
  return (
    <SegmentedControl
      className="min-h-0 flex-1 gap-0"
      items={segments.map((segment) => ({
        value: segment.value,
        label: segment.label,
        invalid: segment.fields?.some((field) => {
          const errors = store.getError(field);
          return Array.isArray(errors) ? errors.length > 0 : Boolean(errors);
        }),
        invalidLabel: t("EditorTabs.invalid"),
      }))}
      label={label}
      listClassName="mx-6 mt-4 mb-2 w-auto"
      value={active}
      onValueChange={(next) =>
        store.runAfterChannelDraft(() => {
          setChosen(next);
          rememberDrawerSegment(next);
        })
      }
    >
      {segments.map((segment) => (
        <SegmentedControlPanel key={segment.value} className="m-0 flex min-h-0 flex-1 flex-col" value={segment.value}>
          {segment.content}
        </SegmentedControlPanel>
      ))}
    </SegmentedControl>
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
