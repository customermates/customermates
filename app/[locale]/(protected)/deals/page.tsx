import { redirectLegacyRecordRoute } from "../records/legacy-record-redirect";

export default async function LegacyRecordListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return redirectLegacyRecordRoute("deal", undefined, searchParams);
}
