"use client";

import type { TemplateCardData } from "./template-card";

import { Search } from "lucide-react";
import { useState } from "react";

import { cn } from "@/core/utils/cn";

import { TemplateCard } from "./template-card";

export type TemplateGalleryLabels = {
  all: string;
  copyPrompt: string;
  filterLabel: string;
  noResults: string;
  searchLabel: string;
  searchPlaceholder: string;
  worksWith: string;
};

type Props = {
  families: { id: string; label: string }[];
  items: TemplateCardData[];
  labels: TemplateGalleryLabels;
};

const ALL = "all";

function matches(item: TemplateCardData, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [item.name, item.summary, item.familyLabel].some((text) => text.toLocaleLowerCase().includes(needle));
}

export function TemplateGallery({ families, items, labels }: Props) {
  const [family, setFamily] = useState<string>(ALL);
  const [query, setQuery] = useState("");
  const shown = items.filter((item) => (family === ALL || item.family === family) && matches(item, query));
  const filters = [{ id: ALL, label: labels.all }, ...families];

  return (
    <div data-template-gallery="">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div aria-label={labels.filterLabel} className="flex flex-wrap gap-2" role="group">
          {filters.map((filter) => (
            <button
              key={filter.id}
              aria-pressed={family === filter.id}
              className={cn(
                "mk-chip cursor-pointer",
                family === filter.id && "bg-foreground text-background hover:bg-foreground hover:text-background",
              )}
              type="button"
              onClick={() => setFamily(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <label className="relative block w-full lg:max-w-xs">
          <span className="sr-only">{labels.searchLabel}</span>

          <Search
            aria-hidden
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-subdued"
          />

          <input
            className="h-10 w-full rounded-lg border border-border bg-card ps-9 pe-3 text-sm text-foreground outline-none placeholder:text-subdued focus-visible:ring-2 focus-visible:ring-ring/50"
            placeholder={labels.searchPlaceholder}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>

      {shown.length > 0 ? (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" data-template-results="">
          {shown.map((item) => (
            <TemplateCard key={item.slug} copyLabel={labels.copyPrompt} data={item} worksWith={labels.worksWith} />
          ))}
        </ul>
      ) : (
        <p className="py-12 text-center text-sm text-muted-foreground" role="status">
          {labels.noResults}
        </p>
      )}
    </div>
  );
}
