"use client";

import { useCallback, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Tab, Tabs } from "@heroui/tabs";
import { ComputerDesktopIcon, MoonIcon, SunIcon } from "@heroicons/react/24/outline";

import { Theme } from "@/generated/prisma";

import { XIcon } from "./x-icon";

type Props = {
  onThemeChange?: (theme: Theme) => Promise<void>;
  hideSystem?: boolean;
};

const THEMES: { key: Theme; icon: typeof ComputerDesktopIcon }[] = [
  { key: Theme.system, icon: ComputerDesktopIcon },
  { key: Theme.light, icon: SunIcon },
  { key: Theme.dark, icon: MoonIcon },
];

export function XThemeSwitcher({ onThemeChange, hideSystem = false }: Props) {
  const t = useTranslations("Common");
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const availableThemes = hideSystem ? THEMES.filter((t) => t.key !== Theme.system) : THEMES;

  const handleThemeChange = useCallback(
    async (newTheme: string) => {
      const themeEnum = newTheme as Theme;
      setTheme(themeEnum);

      if (onThemeChange) await onThemeChange(themeEnum);
    },
    [setTheme, onThemeChange],
  );

  const defaultTheme = hideSystem ? Theme.light : Theme.system;
  const selectedKey = mounted ? (theme ? theme : defaultTheme) : Theme.system;

  if (!mounted)
    return <div className="h-[26px] w-[52px] rounded-full bg-default-200 dark:bg-default-100 animate-pulse" />;

  return (
    <Tabs
      aria-label={t("ariaLabels.themeSwitcher")}
      classNames={{
        tabList: "p-[2px] gap-1",
        cursor: "h-[22px] w-[22px]",
        tab: "p-0 h-[22px] w-[22px]",
      }}
      radius="full"
      selectedKey={selectedKey}
      variant="solid"
      onSelectionChange={(key) => void handleThemeChange(key as string)}
    >
      {availableThemes.map(({ key, icon }) => (
        <Tab key={key} title={<XIcon icon={icon} size="sm" />} />
      ))}
    </Tabs>
  );
}
