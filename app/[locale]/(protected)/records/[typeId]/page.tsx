import type { TrashedRecordInfo } from "@/features/trash/trash.schema";

import { notFound, redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { z } from "zod";

import { getGetRecordPresentationInteractor, getQueryTrashInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { readSurfaceParams } from "@/core/data-view/next/read-surface-params";
import { recordSurfaceKey } from "@/core/data-view/data-view-keys";
import { unwrapPage } from "@/core/validation/next/unwrap-page";
import { interactorFailureKind } from "@/core/validation/validation.utils";
import { buildLocalePath } from "@/i18n/locale-registry";
import { PageContainer } from "@/components/shared/page-container";
import { RecordsPageView } from "./components/records-page-view";
import { RecordListTrashView } from "./components/record-list-trash-view";

type SearchParams = Record<string, string | string[] | undefined>;

function withoutView(searchParams: SearchParams): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "view" || value === undefined) continue;
    for (const entry of Array.isArray(value) ? value : [value]) query.append(key, entry);
  }
  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}

async function trashedList(typeId: string): Promise<{ label: string; trash: TrashedRecordInfo } | null> {
  const result = await getQueryTrashInteractor().invoke({ kinds: ["list"], typeIds: [typeId], page: 1, pageSize: 1 });
  const item = result.ok ? result.data.items.find((entry) => entry.targetId === typeId) : undefined;
  if (!item) return null;
  return {
    label: item.label,
    trash: {
      itemId: item.id,
      deletedAt: item.deletedAt,
      expiresAt: item.expiresAt,
      daysLeft: item.daysLeft,
      deletedBy: item.deletedBy,
      canRestore: true,
    },
  };
}

export default async function RecordsPage({
  params,
  searchParams,
}: {
  params: Promise<{ typeId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requireAccess();
  const { typeId } = await params;
  if (!z.uuid().safeParse(typeId).success) notFound();
  const raw = await searchParams;
  const query = await readSurfaceParams(recordSurfaceKey(typeId), raw);
  const outcome = await getGetRecordPresentationInteractor().invoke({ typeId, params: query });
  const trashed =
    !outcome.ok && interactorFailureKind(outcome.error) === "not_found" ? await trashedList(typeId) : null;
  if (trashed) {
    return (
      <PageContainer padded={false}>
        <RecordListTrashView key={typeId} label={trashed.label} trash={trashed.trash} />
      </PageContainer>
    );
  }
  const presentation = await unwrapPage(Promise.resolve(outcome));
  if (query.viewId !== undefined && presentation.result.activeViewKey !== query.viewId)
    redirect(buildLocalePath(await getLocale(), `/records/${typeId}${withoutView(raw)}`));
  return (
    <PageContainer padded={false}>
      <RecordsPageView key={typeId} presentation={presentation} />
    </PageContainer>
  );
}
