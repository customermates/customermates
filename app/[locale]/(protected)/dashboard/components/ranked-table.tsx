"use client";

import { useTranslations } from "next-intl";
import { EmptyValue } from "@/components/shared/empty-value";

import { TruncatedText } from "@/components/shared/truncated-text";
import { useRecordValueFormat } from "@/components/records/record-value";

export type RankedTableRow = {
  key: string;
  label: string;
  formattedValue: string;
  share: number | null;
  barWidth: number;
  color: string;
};

type Props = {
  hiddenCount: number;
  rows: RankedTableRow[];
};

export function RankedTable({ hiddenCount, rows }: Props) {
  const t = useTranslations();
  const valueFormat = useRecordValueFormat();

  return (
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
              <td className="py-1 pr-2 tabular-nums text-muted-foreground">{index + 1}</td>

              <th className="w-full max-w-0 py-1 text-left font-normal" scope="row">
                <TruncatedText>{row.label}</TruncatedText>

                <span aria-hidden className="mt-0.5 block h-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full"
                    style={{ backgroundColor: row.color, width: `${Math.round(row.barWidth * 1000) / 10}%` }}
                  />
                </span>
              </th>

              <td className="whitespace-nowrap py-1 pl-2 text-right font-medium tabular-nums">{row.formattedValue}</td>

              <td className="whitespace-nowrap py-1 pl-3 text-right tabular-nums text-muted-foreground">
                {row.share === null ? <EmptyValue /> : valueFormat.percent(row.share)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {hiddenCount > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">{t("RecordWidgets.ranked.more", { count: hiddenCount })}</p>
      )}
    </div>
  );
}
