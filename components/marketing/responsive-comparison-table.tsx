"use client";

import type { ReactNode } from "react";

import { Fragment, useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";

import { Icon } from "@/components/shared/icon";
import { cn } from "@/core/utils/cn";
import { MarketingTableFrame } from "@/components/marketing/marketing-table-frame";

export type ComparisonColumn = {
  key: string;
  header: ReactNode;
  featured?: boolean;
  label?: string;
};

export type ComparisonRow = {
  label: string;
  values: (string | boolean)[];
};

export type ComparisonSection = {
  title?: string;
  rows: ComparisonRow[];
};

export type ResponsiveComparisonTableProps = {
  header?: ReactNode;
  columns: ComparisonColumn[];
  sections: ComparisonSection[];
};

function CellValue({ align = "center", value }: { align?: "center" | "start"; value: string | boolean }) {
  if (typeof value === "boolean") {
    return (
      <Icon
        className={cn(
          "size-[1.125rem]",
          align === "center" && "mx-auto",
          value ? "text-foreground" : "text-muted-foreground/70",
        )}
        icon={value ? Check : X}
        strokeWidth={value ? 2.25 : 1.75}
      />
    );
  }

  return <span className="text-sm leading-6 break-words hyphens-auto text-foreground/90">{value}</span>;
}

const FEATURED_CELL =
  "bg-[var(--mk-wash)] shadow-[inset_1.5px_0_0_var(--foreground),inset_-1.5px_0_0_var(--foreground)]";

function MobileComparison({ columns, sections }: Pick<ResponsiveComparisonTableProps, "columns" | "sections">) {
  return (
    <div className="divide-y divide-border md:hidden" data-comparison-mobile="">
      {sections.map((section, sectionIndex) => (
        <div key={sectionIndex}>
          {section.title ? (
            <p className="bg-card px-4 pt-5 pb-2 text-sm font-semibold text-foreground">{section.title}</p>
          ) : null}

          <ul className="divide-y divide-border">
            {section.rows.map((row, rowIndex) => (
              <li key={rowIndex} className="p-4">
                <p className="text-sm font-medium text-foreground">{row.label}</p>

                <dl className="mt-3 grid gap-2">
                  {row.values.map((value, valueIndex) => {
                    const column = columns[valueIndex];

                    return (
                      <div
                        key={column?.key ?? valueIndex}
                        className={cn(
                          "grid grid-cols-[6.5rem_1fr] items-start gap-3 rounded-lg px-3 py-2",
                          column?.featured
                            ? "bg-[var(--mk-wash)] ring-[1.5px] ring-foreground ring-inset"
                            : "bg-transparent",
                        )}
                      >
                        <dt className="pt-0.5 text-xs font-medium text-muted-foreground">
                          {column?.label ?? column?.header}
                        </dt>

                        <dd className="min-w-0">
                          <CellValue align="start" value={value} />
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function ResponsiveComparisonTable({ header, columns, sections }: ResponsiveComparisonTableProps) {
  const [pinned, setPinned] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(([entry]) => setPinned(!entry.isIntersecting), {
      rootMargin: "-64px 0px 0px 0px",
    });
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  const stickyHeaderEdge = pinned ? "border-b border-border" : "";

  return (
    <MarketingTableFrame>
      <div ref={sentinelRef} aria-hidden className="absolute left-0 top-0 size-px" />

      <MobileComparison columns={columns} sections={sections} />

      <table className="w-full border-separate border-spacing-0 text-left max-md:hidden">
        <thead className="sticky! top-[var(--table-sticky-top,0px)] z-[27]">
          <tr>
            <th
              className={`min-w-[150px] bg-card px-3 py-5 align-middle text-base font-semibold break-words hyphens-auto lg:px-6 ${stickyHeaderEdge}`}
              scope="col"
            >
              {header}
            </th>

            {columns.map((column) =>
              column.featured ? (
                <th
                  key={column.key}
                  className={cn(
                    "h-px min-w-[130px] bg-card p-0 text-center align-middle text-base font-semibold break-words hyphens-auto",
                    stickyHeaderEdge,
                  )}
                  data-comparison-featured=""
                  scope="col"
                >
                  <div className="flex h-full items-center justify-center rounded-t-xl bg-[color-mix(in_oklab,var(--card),var(--foreground)_3.5%)] px-2 py-5 text-foreground shadow-[inset_1.5px_0_0_var(--foreground),inset_-1.5px_0_0_var(--foreground),inset_0_1.5px_0_var(--foreground)] lg:px-4">
                    {column.header}
                  </div>
                </th>
              ) : (
                <th
                  key={column.key}
                  className={cn(
                    "min-w-[130px] bg-card px-2 py-5 text-center align-middle text-base font-semibold break-words hyphens-auto lg:px-4",
                    stickyHeaderEdge,
                  )}
                  scope="col"
                >
                  {column.header}
                </th>
              ),
            )}
          </tr>
        </thead>

        <tbody>
          {sections.map((section, sectionIndex) => (
            <Fragment key={sectionIndex}>
              {section.title ? (
                <tr>
                  <th
                    className="border-t border-border bg-card px-3 pt-6 pb-3 text-left text-sm font-semibold tracking-tight text-foreground lg:px-6"
                    scope="colgroup"
                  >
                    {section.title}
                  </th>

                  {columns.map((column) => (
                    <td
                      key={column.key}
                      aria-hidden
                      className={cn("border-t border-border bg-card", column.featured && FEATURED_CELL)}
                    />
                  ))}
                </tr>
              ) : null}

              {section.rows.map((row, rowIndex) => {
                const lastRow = sectionIndex === sections.length - 1 && rowIndex === section.rows.length - 1;

                return (
                  <tr key={rowIndex}>
                    <th
                      className="min-w-[150px] border-t border-border px-3 py-3.5 text-left text-sm font-normal text-muted-foreground break-words hyphens-auto lg:px-6"
                      scope="row"
                    >
                      {row.label}
                    </th>

                    {row.values.map((value, valueIndex) => {
                      const featured = columns[valueIndex]?.featured;

                      return (
                        <td
                          key={valueIndex}
                          className={cn(
                            "min-w-[130px] border-t border-border px-2 py-3.5 text-center align-middle lg:px-4",
                            featured && FEATURED_CELL,
                            featured &&
                              lastRow &&
                              "rounded-b-xl shadow-[inset_1.5px_0_0_var(--foreground),inset_-1.5px_0_0_var(--foreground),inset_0_-1.5px_0_var(--foreground)]",
                          )}
                        >
                          <CellValue value={value} />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </MarketingTableFrame>
  );
}
