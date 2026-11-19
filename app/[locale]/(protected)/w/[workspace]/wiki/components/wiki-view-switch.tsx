"use client";

import type { WikiView } from "@/features/p13n/p13n-settings.schema";
import type { LucideIcon } from "lucide-react";

import { List, Waypoints } from "lucide-react";
import { useTranslations } from "next-intl";

import { SegmentedControl } from "@/components/ui/segmented-control";

const ICONS: Record<WikiView, LucideIcon> = { map: Waypoints, pages: List };
const ORDER: readonly WikiView[] = ["map", "pages"];

type Props = {
  view: WikiView;
  onChange: (view: WikiView) => void;
};

export function WikiViewSwitch({ view, onChange }: Props) {
  const t = useTranslations();
  const labels: Record<WikiView, string> = { map: t("Wiki.view.map"), pages: t("Wiki.view.pages") };

  return (
    <div data-wiki-view-switch={view}>
      <SegmentedControl
        idPrefix="wiki-view"
        items={ORDER.map((value) => {
          const Icon = ICONS[value];
          return {
            value,
            controls: "wiki-document-panel",
            label: (
              <span className="inline-flex items-center gap-1.5">
                <Icon aria-hidden="true" className="size-3.5" />

                {labels[value]}
              </span>
            ),
          };
        })}
        label={t("Wiki.view.label")}
        listClassName="w-auto"
        value={view}
        onValueChange={onChange}
      />
    </div>
  );
}
