import { notFound } from "next/navigation";
import { RecordRefSchema } from "@/features/records/record-model.schema";
import { getGetRecordEditorInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { unwrapValidated } from "@/core/validation/validation.utils";
import { PageContainer } from "@/components/shared/page-container";
import { RecordDetailPage } from "../components/record-detail-page";

export default async function RecordPage({ params }: { params: Promise<{ typeId: string; recordId: string }> }) {
  await requireAccess();
  const { typeId, recordId } = await params;
  const parsed = RecordRefSchema.safeParse({ typeId, recordId });
  if (!parsed.success) notFound();
  const initial = await unwrapValidated(getGetRecordEditorInteractor().invoke(parsed.data));
  return (
    <PageContainer padded={false}>
      <RecordDetailPage key={`${parsed.data.typeId}:${parsed.data.recordId}`} initial={initial} />
    </PageContainer>
  );
}
