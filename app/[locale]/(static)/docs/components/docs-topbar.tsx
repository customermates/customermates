"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { IntlLink } from "@/i18n/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

import { ShellHeader } from "@/app/components/shell-header";
import { LocaleMenu } from "@/components/shared/locale-menu";
import { ThemeSwitcher } from "@/components/shared/theme-switcher";

import { isDocItemActive, normalizeDocsPath, useDocGroups } from "./docs-sidebar";

export function DocsTopBar() {
  const t = useTranslations();
  const pathname = usePathname();
  const groups = useDocGroups();

  const activeTitle = useMemo(() => {
    const normalized = normalizeDocsPath(pathname);
    for (const group of groups)
      for (const item of group.items) if (isDocItemActive(item, normalized)) return item.title;

    return null;
  }, [pathname, groups]);

  const rootLabel = t("DocsSidebar.introduction");

  return (
    <ShellHeader
      actions={
        <div className="flex items-center gap-1">
          <LocaleMenu align="end" />

          <ThemeSwitcher />
        </div>
      }
    >
      <Breadcrumb aria-label={t("Common.ariaLabels.breadcrumb")} className="min-w-0">
        <BreadcrumbList className="flex-nowrap">
          <BreadcrumbItem className="shrink-0">
            {activeTitle ? (
              <BreadcrumbLink asChild>
                <IntlLink href="/docs">{rootLabel}</IntlLink>
              </BreadcrumbLink>
            ) : (
              <BreadcrumbPage>{rootLabel}</BreadcrumbPage>
            )}
          </BreadcrumbItem>

          {activeTitle && activeTitle !== rootLabel && (
            <>
              <BreadcrumbSeparator className="shrink-0" />

              <BreadcrumbItem className="min-w-0">
                <BreadcrumbPage className="truncate">{activeTitle}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>
    </ShellHeader>
  );
}
