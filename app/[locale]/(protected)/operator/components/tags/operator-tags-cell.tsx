"use client";

import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";

const VISIBLE_TAG_COUNT = 2;

export function OperatorTagsCell({ tags }: { tags: string[] }) {
  const t = useTranslations();

  if (tags.length === 0) return <span className="text-sm text-muted-foreground">-</span>;

  const visible = tags.slice(0, VISIBLE_TAG_COUNT);
  const overflow = tags.slice(VISIBLE_TAG_COUNT);

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((tag) => (
        <AppChip key={tag} size="sm" variant="secondary">
          {tag}
        </AppChip>
      ))}

      {overflow.length > 0 ? (
        <AppChip size="sm" tooltip={overflow.join(", ")} variant="outline">
          {t("OperatorWorkspaces.tags.more", { count: overflow.length })}
        </AppChip>
      ) : null}
    </div>
  );
}
