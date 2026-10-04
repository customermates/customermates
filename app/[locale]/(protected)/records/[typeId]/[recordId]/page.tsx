import { notFound } from "next/navigation";
import { RecordRefSchema } from "@/features/records/record-model.schema";
import { getGetRecordEditorInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { unwrapValidated } from "@/core/validation/validation.utils";
import { PageContainer } from "@/components/shared/page-container";
import { getOptionalP13n } from "@/features/p13n/next/get-optional-p13n";
import { RecordDetailPage } from "../components/record-detail-page";
import { recordPanelsP13nId } from "../components/record-panels-personalization";

export default async function RecordPage({ params }: { params: Promise<{ typeId: string; recordId: string }> }) {
  await requireAccess();
  const { typeId, recordId } = await params;
  const parsed = RecordRefSchema.safeParse({ typeId, recordId });
  if (!parsed.success) notFound();
  const [initial, panelLayout] = await Promise.all([
    unwrapValidated(getGetRecordEditorInteractor().invoke(parsed.data)),
    getOptionalP13n(recordPanelsP13nId(parsed.data.typeId)),
  ]);
  return (
    <PageContainer padded={false}>
      <RecordDetailPage
        key={`${parsed.data.typeId}:${parsed.data.recordId}`}
        initial={initial}
        panelLayoutInitial={panelLayout?.columnWidths ?? undefined}
      />
    </PageContainer>
  );
}
