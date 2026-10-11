"use client";

import type { ReactNode } from "react";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function ReadOnlyHint({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <Tooltip open={hovered || focused} onOpenChange={setHovered}>
      <TooltipTrigger asChild>
        <div
          className="w-full min-w-0"
          data-read-only-hint=""
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
          }}
          onFocus={() => setFocused(true)}
        >
          {children}
        </div>
      </TooltipTrigger>

      <TooltipContent>{t("Common.readOnlyField")}</TooltipContent>
    </Tooltip>
  );
}
