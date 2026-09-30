import { redirectLegacyRecordRoute } from "../../records/legacy-record-redirect";

export default async function LegacyRecordDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  return redirectLegacyRecordRoute("task", id, searchParams);
}
