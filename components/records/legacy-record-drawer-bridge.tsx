"use client";

import { useEffect, useRef } from "react";
import { observer } from "mobx-react-lite";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";

import { useRootStore } from "@/core/stores/root-store.provider";
import type { RecordNavigation } from "@/features/records/record-navigation.schema";

const aliases = new Set(["contact", "organization", "deal", "service", "task"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function legacyDrawerRecord(raw: string | null, navigation: RecordNavigation | null) {
  if (!raw || !navigation) return null;
  const token = raw.split(",").at(-1)?.trim();
  const [alias, recordId, extra] = token?.split(":") ?? [];
  if (!alias || !recordId || extra || !aliases.has(alias) || (recordId !== "new" && !uuid.test(recordId))) return null;
  const type = navigation.types.find((candidate) => candidate.legacyAlias === alias);
  if (!type || (recordId === "new" && !type.canCreate)) return null;
  return { typeId: type.id, ...(recordId === "new" ? {} : { recordId }) };
}

export const LegacyRecordDrawerBridge = observer(function LegacyRecordDrawerBridge() {
  const store = useRootStore().recordWorkspaceStore;
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const open = searchParams.get("open");
  const attempted = useRef<string | null>(null);
  const target = legacyDrawerRecord(open, store.navigation);

  useEffect(() => {
    if (!open) {
      attempted.current = null;
      return;
    }
    if (!target) return;
    const key = `${store.navigation?.companyId}:${open}`;
    if (attempted.current === key) return;
    attempted.current = key;
    store.open(target);
  }, [open, store, target?.typeId, target?.recordId, store.navigation?.companyId]);

  useEffect(() => {
    if (!open || !target || !store.editor?.isOpen || store.editor.presentation.typeId !== target.typeId) return;
    if (target.recordId && store.editor.record?.ref.recordId !== target.recordId) return;
    if (!target.recordId && store.editor.record !== null) return;
    const key = `${store.navigation?.companyId}:${open}`;
    if (attempted.current !== key) return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete("open");
    router.replace(next.size ? `${pathname}?${next.toString()}` : pathname, { scroll: false });
  }, [
    open,
    target?.typeId,
    target?.recordId,
    store.editor?.isOpen,
    store.navigation?.companyId,
    pathname,
    router,
    searchParams,
  ]);

  return null;
});
