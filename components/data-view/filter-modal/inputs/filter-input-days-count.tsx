"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { useAppForm } from "@/components/forms/form-context";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  isValidFilter: boolean;
};

const PRESETS = [7, 30, 90, 365] as const;

export const FilterInputDaysCount = observer(({ id, isValidFilter }: Props) => {
  const store = useAppForm();
  const t = useTranslations("Common.filters");
  const raw = store?.getValue(id);
  const value = typeof raw === "number" ? raw : typeof raw === "string" && raw !== "" ? Number(raw) : undefined;

  function commit(next: number | undefined) {
    store?.onChange(id, next);
  }

  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="relative">
        <Input
          className={cn("h-full pr-12", isValidFilter ? "border-primary bg-primary/10" : "border-input")}
          disabled={store?.isDisabled}
          id={id}
          inputMode="numeric"
          min={1}
          placeholder={t("daysPlaceholder")}
          step={1}
          type="number"
          value={value ?? ""}
          onChange={(e) => {
            const next = e.target.value;
            if (next === "") {
              commit(undefined);
              return;
            }
            const parsed = Number.parseInt(next, 10);
            commit(Number.isFinite(parsed) && parsed > 0 ? parsed : undefined);
          }}
        />

        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {t("daysSuffix")}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((days) => (
          <button
            key={days}
            className={cn(
              "rounded-md border px-2 py-0.5 text-[11px] transition-colors",
              value === days
                ? "border-primary bg-primary/10 text-primary"
                : "border-input bg-input-background text-muted-foreground hover:text-foreground",
            )}
            disabled={store?.isDisabled}
            type="button"
            onClick={() => commit(days)}
          >
            {t("daysPreset", { count: days })}
          </button>
        ))}
      </div>
    </div>
  );
});
