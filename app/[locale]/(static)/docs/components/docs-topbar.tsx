"use client";

import { useMemo } from "react";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

import { ShellHeader } from "@/app/components/shell-header";

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
    <ShellHeader>
      <Breadcrumb className="min-w-0">
        <BreadcrumbList className="flex-nowrap">
          <BreadcrumbItem className="shrink-0">
            {activeTitle ? (
              <BreadcrumbLink asChild>
                <NextLink href="/docs">{rootLabel}</NextLink>
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
