"use client";

import type { ReactNode } from "react";

import { useTranslations } from "next-intl";

import { AvatarStack } from "@/components/shared/avatar-stack";
import { OverflowRail } from "@/components/shared/overflow-rail";
import { TruncatedText } from "@/components/shared/truncated-text";
import { EmptyValue } from "@/components/shared/empty-value";

export type EntityDetailSummaryField = {
  id: string;
  label: string;
  value: ReactNode;
};

type AvatarItem = {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  email?: string | null;
};

type AvatarSummaryValueProps = {
  items: readonly AvatarItem[];
  onItemClick: (item: AvatarItem) => void;
};

export function EntityDetailAvatarSummaryValue({ items, onItemClick }: AvatarSummaryValueProps) {
  return items.length > 0 ? (
    <AvatarStack items={[...items]} size="default" onAvatarClick={onItemClick} />
  ) : (
    <EmptyValue />
  );
}

function SummaryValue({ children }: { children: ReactNode }) {
  const value = children === null || children === undefined || children === "" ? <EmptyValue /> : children;
  const isPlainText = typeof value === "string" || typeof value === "number";

  return (
    <div
      data-summary-value
      className="mt-0.5 flex min-h-6 min-w-0 items-center overflow-hidden text-sm text-foreground"
    >
      {isPlainText ? <TruncatedText className="w-full">{String(value)}</TruncatedText> : value}
    </div>
  );
}

function SummaryEntry({ item }: { item: EntityDetailSummaryField }) {
  return (
    <div className="min-w-0" data-summary-field={item.id}>
      <div data-summary-label>
        <TruncatedText className="w-full text-[11px] font-medium text-muted-foreground">{item.label}</TruncatedText>
      </div>

      <SummaryValue>{item.value}</SummaryValue>
    </div>
  );
}

export function EntityDetailSummaryRail({ items }: { items: EntityDetailSummaryField[] }) {
  const t = useTranslations();

  return (
    <section
      data-entity-detail-summary
      className="shrink-0 border-b border-border bg-background px-4 ps-[calc(1rem+var(--safe-left,0px))] pe-[calc(1rem+var(--safe-right,0px))]"
      data-joins-top-bar=""
      data-summary-variant="pinned-mini-cards"
    >
      <OverflowRail
        focusable
        ariaLabel={t("NavigationBar.overview")}
        observedKey={items.length}
        overflowAttribute="data-summary-overflow"
        railClassName="gap-2 pt-0 pb-4"
        railProps={{
          "data-summary-geometry": "cards",
          "data-summary-rail": "",
        }}
        regionProps={{ "data-summary-scroll-region": "" }}
      >
        {items.map((item) => (
          <div
            key={item.id}
            className="min-w-0 w-fit max-w-56 flex-none rounded-md border border-border/60 bg-card/40 px-3 py-2"
            data-summary-cell={item.id}
          >
            <SummaryEntry item={item} />
          </div>
        ))}
      </OverflowRail>
    </section>
  );
}
