"use client";

import { useCallback, useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/core/utils/cn";
import { Theme } from "@/generated/prisma";
import { runUserAction } from "@/core/errors/report-application-error";

type Props = {
  className?: string;
  onThemeChange?: (theme: Theme) => Promise<void>;
};

export function ThemeSwitcher({ className, onThemeChange }: Props) {
  const t = useTranslations();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const handleThemeChange = useCallback(
    async (newTheme: Theme) => {
      setTheme(newTheme);

      if (onThemeChange) await onThemeChange(newTheme);
    },
    [setTheme, onThemeChange],
  );

  if (!mounted) {
    return (
      <div
        aria-hidden
        className={cn("size-8 animate-pulse rounded-md bg-placeholder motion-reduce:animate-none", className)}
      />
    );
  }

  const selectedTheme = resolvedTheme === Theme.dark ? Theme.dark : Theme.light;
  const nextTheme = selectedTheme === Theme.dark ? Theme.light : Theme.dark;
  const SelectedIcon = selectedTheme === Theme.dark ? Moon : Sun;
  const selectedThemeLabel = selectedTheme === Theme.dark ? t("Common.themes.dark") : t("Common.themes.light");

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={`${t("Common.ariaLabels.themeSwitcher")}: ${selectedThemeLabel}`}
            aria-pressed={selectedTheme === Theme.dark}
            className={cn("size-8 rounded-md p-0 text-subdued hover:text-foreground", className)}
            data-theme={selectedTheme}
            size="icon-sm"
            variant="ghost"
            onClick={() => runUserAction(() => handleThemeChange(nextTheme))}
          >
            <Icon aria-hidden icon={SelectedIcon} size="md" />
          </Button>
        </TooltipTrigger>

        <TooltipContent>{selectedThemeLabel}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
