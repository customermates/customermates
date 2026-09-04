"use client";

import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SIGNATURE_ACCENT_PRESETS, signatureContrast } from "@/ee/messaging/signature-fields";
import { cn } from "@/core/utils/cn";

type Props = {
  disabled?: boolean;
  value: string;
  onValueChange: (value: string) => void;
};

export function SignatureColorField({ disabled = false, value, onValueChange }: Props) {
  const t = useTranslations();
  const normalized = value.toLowerCase();
  const contrast = /^#[0-9a-f]{6}$/.test(normalized) ? signatureContrast(normalized) : null;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label className="text-subdued text-xs" htmlFor="signature-accentHex">
        {t("ConnectedAccountsCard.signatureAccent")}
      </Label>

      <div className="flex min-w-0 items-center gap-1.5">
        {SIGNATURE_ACCENT_PRESETS.map((preset) => (
          <Tooltip key={preset}>
            <TooltipTrigger asChild>
              <button
                aria-label={preset}
                className={cn(
                  "size-6 shrink-0 rounded-md border transition-all",
                  "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
                  normalized === preset ? "border-ring ring-ring/40 ring-2" : "border-border",
                  disabled ? "pointer-events-none opacity-50" : "hover:scale-110",
                )}
                disabled={disabled}
                style={{ backgroundColor: preset }}
                type="button"
                onClick={() => onValueChange(preset)}
              />
            </TooltipTrigger>

            <TooltipContent>{preset}</TooltipContent>
          </Tooltip>
        ))}

        <Input
          className="w-28 min-w-0 font-mono text-xs"
          disabled={disabled}
          id="signature-accentHex"
          maxLength={7}
          value={value}
          onChange={(event) => onValueChange(event.target.value.trim())}
        />

        <input
          aria-label={t("ConnectedAccountsCard.signatureAccent")}
          className="border-border size-8 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5 disabled:pointer-events-none disabled:opacity-50"
          disabled={disabled}
          type="color"
          value={/^#[0-9a-f]{6}$/.test(normalized) ? normalized : "#000000"}
          onChange={(event) => onValueChange(event.target.value)}
        />
      </div>

      {contrast && !contrast.readable && (
        <p className="text-warning text-xs">
          {t("ConnectedAccountsCard.signatureAccentLowContrast", {
            light: contrast.light.toFixed(1),
            dark: contrast.dark.toFixed(1),
          })}
        </p>
      )}
    </div>
  );
}
