import { notFound } from "next/navigation";
import { interactorFailureKind, type InteractorOutcome } from "@/core/validation/validation.utils";
import type { RecordEditorResult } from "@/features/records/get-record-editor.interactor";
import type { RecordRef } from "@/features/records/record-model.schema";
import type { TrashedRecordInfo } from "@/features/trash/trash.schema";
import { RecordRefSchema } from "@/features/records/record-model.schema";
import { getGetRecordEditorInteractor, getGetTrashedRecordInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { PageContainer } from "@/components/shared/page-container";
import { RecordAccessDeniedPage } from "@/components/records/record-access-denied";
import { getOptionalP13n } from "@/features/p13n/next/get-optional-p13n";
import { RecordDetailPage } from "../components/record-detail-page";
import { recordDetailKey } from "@/features/records/record-detail-layout.schema";
import { recordPanelsP13nId, recordPanelWidths } from "../components/record-panels-personalization";

async function recordOrTrashed(
  editor: InteractorOutcome<RecordEditorResult>,
  ref: RecordRef,
): Promise<(RecordEditorResult & { trash?: TrashedRecordInfo }) | "denied"> {
  if (editor.ok) return editor.data;
  const trashed = await getGetTrashedRecordInteractor().invoke(ref);
  if (trashed.ok) return trashed.data;
  const kinds = [editor.error, trashed.error].map(interactorFailureKind);
  if (kinds.includes("authorization")) return "denied";
  if (kinds[0] === "not_found") notFound();
  throw editor.error;
}

export default async function RecordPage({ params }: { params: Promise<{ typeId: string; recordId: string }> }) {
  await requireAccess();
  const { typeId, recordId } = await params;
  const parsed = RecordRefSchema.safeParse({ typeId, recordId });
  if (!parsed.success) notFound();
  const [editor, panelLayout, migratedDetail] = await Promise.all([
    getGetRecordEditorInteractor().invoke(parsed.data),
    getOptionalP13n(recordPanelsP13nId(parsed.data.typeId)),
    getOptionalP13n(recordDetailKey(parsed.data.typeId)),
  ]);
  const loaded = await recordOrTrashed(editor, parsed.data);
  if (loaded === "denied") return <RecordAccessDeniedPage />;
  const { trash, ...initial } = loaded;
  return (
    <PageContainer padded={false}>
      <RecordDetailPage
        key={`${parsed.data.typeId}:${parsed.data.recordId}`}
        initial={initial}
        panelLayoutInitial={recordPanelWidths(panelLayout, migratedDetail)}
        trash={trash}
      />
    </PageContainer>
  );
}
