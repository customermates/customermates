"use client";

import { useCallback, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Monitor, Moon, Sun } from "lucide-react";

import { Theme } from "@/generated/prisma";
import { Button } from "@/components/ui/button";
import { cn } from "@/core/utils/cn";

import { Icon } from "./icon";

type Props = {
  onThemeChange?: (theme: Theme) => Promise<void>;
  hideSystem?: boolean;
};

const THEMES: { key: Theme; icon: typeof Monitor }[] = [
  { key: Theme.system, icon: Monitor },
  { key: Theme.light, icon: Sun },
  { key: Theme.dark, icon: Moon },
];

export function ThemeSwitcher({ onThemeChange, hideSystem = false }: Props) {
  const t = useTranslations();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const availableThemes = hideSystem ? THEMES.filter((t) => t.key !== Theme.system) : THEMES;

  const handleThemeChange = useCallback(
    async (newTheme: Theme) => {
      setTheme(newTheme);

      if (onThemeChange) await onThemeChange(newTheme);
    },
    [setTheme, onThemeChange],
  );

  const defaultTheme = hideSystem ? Theme.light : Theme.system;
  const selectedKey = mounted ? ((theme as Theme | undefined) ?? defaultTheme) : Theme.system;

  if (!mounted) return <div aria-hidden className="h-[26px] w-[52px] rounded-full bg-muted animate-pulse" />;

  return (
    <div
      aria-label={t("Common.ariaLabels.themeSwitcher")}
      className="inline-flex items-center gap-1 rounded-full bg-muted p-0.5"
      role="radiogroup"
    >
      {availableThemes.map(({ key, icon }) => {
        const isSelected = selectedKey === key;
        return (
          <Button
            key={key}
            aria-checked={isSelected}
            className={cn("rounded-full size-[22px] p-0", !isSelected && "bg-transparent hover:bg-background/60")}
            role="radio"
            size="icon-xs"
            type="button"
            variant={isSelected ? "default" : "ghost"}
            onClick={() => void handleThemeChange(key)}
          >
            <Icon icon={icon} size="sm" />
          </Button>
        );
      })}
    </div>
  );
}
