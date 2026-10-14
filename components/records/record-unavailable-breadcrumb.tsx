"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { useRootStore } from "@/core/stores/root-store.provider";

export function RecordUnavailableBreadcrumb({ kind }: { kind: "denied" | "missing" }) {
  const pathname = usePathname();
  const t = useTranslations();
  const root = useRootStore();
  const [, records, typeId, recordId, extra] = pathname.split("/").filter(Boolean);
  const title = kind === "denied" ? t("AccessDeniedPage.title") : t("NotFoundPage.title");

  useEffect(() => {
    if (records !== "records" || !typeId || !recordId || extra) return;
    const key = `records:${typeId}`;
    root.layoutStore.setRuntimeIdentity({
      scope: "entity",
      key,
      title: t("RecordModel.records"),
      pictureUrl: null,
      avatarKind: null,
      record: { id: recordId, title, pictureUrl: null, showAvatar: false },
    });
    return () => root.layoutStore.clearRuntimeIdentity("entity", key);
  }, [records, typeId, recordId, extra, root, t, title]);

  return null;
}
