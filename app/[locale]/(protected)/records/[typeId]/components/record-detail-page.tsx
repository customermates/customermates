"use client";

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import type { RecordEditorResult } from "@/features/records/get-record-editor.interactor";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useRouter } from "@/i18n/navigation";
import { RecordEditorStore } from "./record-editor.store";
import { RecordEditor } from "./record-editor";
import { RecordEditorContent } from "./record-editor-content";
import { useRecordRouteReady } from "@/components/records/use-record-route-ready";

export const RecordDetailPage = observer(function RecordDetailPage({ initial }: { initial: RecordEditorResult }) {
  useRecordRouteReady();
  const root = useRootStore();
  const t = useTranslations();
  const router = useRouter();
  const [store] = useState(() => {
    const editor = new RecordEditorStore(
      root,
      initial,
      () => Promise.resolve(),
      true,
      () => {
        router.replace(`/records/${initial.typeId}`);
        return Promise.resolve();
      },
    );
    editor.edit(initial, initial.record);
    return editor;
  });
  const applied = useRef(initial);
  useEffect(() => root.recordWorkspaceStore.subscribe(store.refreshRecord), [root, store]);
  if (applied.current !== initial) {
    applied.current = initial;
    if (store.hasRelatedDraft) store.setRefreshRequired(true);
    if (
      !store.hasUnsavedChanges &&
      !store.hasRelatedDraft &&
      initial.model.revision >= store.presentation.model.revision &&
      (initial.record?.version ?? 0) >= (store.record?.version ?? 0)
    )
      store.edit(initial, initial.record);
  }
  const type = store.presentation.model.types.find((type) => type.id === store.presentation.typeId);
  const title = store.record?.fields.find((field) => field.fieldId === type?.primaryFieldId)?.result;
  const name =
    title?.state === "value" && title.value.kind === "text"
      ? title.value.value
      : (type?.label ?? t("RecordModel.record"));
  const avatar = store.presentation.model.capabilities.find(
    (binding) => binding.kind === "avatar" && binding.typeId === type?.id,
  );
  const image = store.record?.fields.find(
    (field) => field.fieldId === avatar?.fields.find((field) => field.role === "image")?.fieldId,
  )?.result;
  const pictureUrl = image?.state === "value" && image.value.kind === "text" ? image.value.value : null;
  const recordId = store.record?.ref.recordId;
  useEffect(() => {
    const key = `records:${initial.typeId}`;
    root.layoutStore.setRuntimeIdentity({
      scope: "entity",
      key,
      title: type?.pluralLabel ?? "",
      pictureUrl: null,
      avatarKind: null,
      record: recordId ? { id: recordId, title: name, pictureUrl, showAvatar: Boolean(avatar) } : undefined,
    });
    return () => root.layoutStore.clearRuntimeIdentity("entity", key);
  }, [initial.typeId, root, type?.pluralLabel, recordId, name, pictureUrl, avatar]);
  return <RecordEditorContent layout="page" renderEditor={(child) => <RecordEditor store={child} />} store={store} />;
});
