"use client";

import { useId, useState, type ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
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
import { IntlLink } from "@/i18n/navigation";
import { runUserAction } from "@/core/errors/report-application-error";
import { RecordDetailPersonalization, RecordDetailLayoutControls } from "./record-detail-personalization";
import { RecordDetailOverview } from "./record-detail-overview";
import { RecordDetailSummary } from "./record-detail-summary";
import { RecordEditorFields } from "./record-editor-fields";
import { RecordEditorActions, RecordPageActions } from "./record-editor-actions";
import { EntityDetailPanels } from "@/components/entity-detail/entity-detail-panels";
import { useRecordDeletion } from "./use-record-deletion";
import { RecordActivitiesPanel } from "@/features/messaging/activities/record-activities-panel";
import { Alert } from "@/components/shared/alert";
import { AppLink } from "@/components/shared/app-link";

const RecordEditorBody = observer(function RecordEditorBody({
  store,
  layout = "drawer",
  renderEditor,
}: {
  store: RecordEditorStore;
  layout?: "drawer" | "page";
  renderEditor: (child: RecordEditorStore) => ReactNode;
}) {
  const t = useTranslations();
  const [panel, setPanel] = useState("details");
  const id = useId();
  const deletion = useRecordDeletion({
    onDeleted: store.deletionCompleted,
    onPending: (id) => store.setPendingOperation(id, true),
  });
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

      {store.refreshRequired && (
        <div className="px-6 pb-3" role="status">
          <Button type="button" variant="secondary" onClick={() => runUserAction(store.refreshRecord)}>
            {t("ErrorCard.retry")}
          </Button>
        </div>
      )}
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
          notes={
            hasNotes ? (
              <div className="p-4">
                <RecordEditorFields notes store={store} />
              </div>
            ) : undefined
          }
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
              <IntlLink href={`/records/${store.record.ref.typeId}/${store.record.ref.recordId}`}>
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
          onValueChange={setPanel}
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
  renderEditor: (child: RecordEditorStore) => ReactNode;
}) {
  return (
    <RecordDetailPersonalization key={props.store.presentation.typeId} store={props.store}>
      <RecordEditorBody {...props} />
    </RecordDetailPersonalization>
  );
});
