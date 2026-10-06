"use client";

import { useTranslations } from "next-intl";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

export type RankedTableRow = {
  key: string;
  label: string;
  formattedValue: string;
  share: number | null;
  barWidth: number;
};

type Props = {
  color: string;
  hiddenCount: number;
  rows: RankedTableRow[];
};

export function RankedTable({ color, hiddenCount, rows }: Props) {
  const t = useTranslations();
  const locale = useHydratedIntlStore().formattingLocale;
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });

  return (
    <TooltipProvider>
      <div className="min-h-0 overflow-auto" data-slot="widget-ranked-table">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="pb-1 pr-2 font-normal" scope="col">
                {t("RecordWidgets.ranked.rank")}
              </th>

              <th className="w-full pb-1 font-normal" scope="col">
                {t("RecordWidgets.ranked.group")}
              </th>

              <th className="whitespace-nowrap pb-1 pl-2 text-right font-normal" scope="col">
                {t("RecordWidgets.ranked.value")}
              </th>

              <th className="whitespace-nowrap pb-1 pl-3 text-right font-normal" scope="col">
                {t("RecordWidgets.ranked.share")}
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row, index) => (
              <tr key={row.key} className="border-t border-border align-top">
                <td className="py-1.5 pr-2 tabular-nums text-muted-foreground">{index + 1}</td>

                <th className="w-full max-w-0 py-1.5 text-left font-normal" scope="row">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="block truncate">{row.label}</span>
                    </TooltipTrigger>

                    <TooltipContent side="top">{row.label}</TooltipContent>
                  </Tooltip>

                  <span aria-hidden className="mt-1 block h-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full"
                      style={{ backgroundColor: color, width: `${Math.round(row.barWidth * 1000) / 10}%` }}
                    />
                  </span>
                </th>

                <td className="whitespace-nowrap py-1.5 pl-2 text-right font-medium tabular-nums">
                  {row.formattedValue}
                </td>

                <td className="whitespace-nowrap py-1.5 pl-3 text-right tabular-nums text-muted-foreground">
                  {row.share === null ? "—" : percent.format(row.share)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {hiddenCount > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">{t("RecordWidgets.ranked.more", { count: hiddenCount })}</p>
        )}
      </div>
    </TooltipProvider>
  );
}
