"use client";

import type { ReactNode } from "react";

import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

import { useAppForm } from "@/components/forms/form-context";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/core/utils/cn";

export type EditorTab = {
  id: string;
  label: ReactNode;
  fields?: readonly string[];
  content: ReactNode;
};

type Props = {
  tabs: readonly EditorTab[];
  label?: string;
  syncUrl?: boolean;
  rememberAs?: string;
  guardChange?: (apply: () => void) => void;
  className?: string;
  contentClassName?: string;
};

const STORAGE_PREFIX = "editor-tab:";

function readRemembered(key: string | undefined) {
  if (!key) return null;
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + key);
  } catch {
    return null;
  }
}

function remember(key: string | undefined, tab: string) {
  if (!key) return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, tab);
  } catch {}
}

export const EditorTabs = observer(function EditorTabs({
  tabs,
  label,
  syncUrl = false,
  rememberAs,
  guardChange,
  className,
  contentClassName,
}: Props) {
  const t = useTranslations();
  const form = useAppForm();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const ids = tabs.map((tab) => tab.id);
  const valid = (id: string | null | undefined) => (id && ids.includes(id) ? id : null);
  const [local, setLocal] = useState(() => valid(readRemembered(rememberAs)));
  const active = (syncUrl ? valid(params.get("tab")) : valid(local)) ?? ids[0];

  if (tabs.length < 2) return tabs[0] ? <div className={cn(className, contentClassName)}>{tabs[0].content}</div> : null;

  const select = (next: string) => {
    const apply = () => {
      if (syncUrl) {
        const query = new URLSearchParams(params.toString());
        query.set("tab", next);
        router.replace(`${pathname}?${query.toString()}`, { scroll: false });
      } else setLocal(next);
      remember(rememberAs, next);
    };
    if (guardChange) guardChange(apply);
    else apply();
  };

  return (
    <Tabs className={cn("min-h-0 flex-1 gap-0", className)} value={active} onValueChange={select}>
      <TabsList
        aria-label={label}
        className="h-13 w-full shrink-0 justify-start gap-0 overflow-x-auto overflow-y-hidden rounded-none border-b p-0 group-data-[orientation=horizontal]/tabs:h-13"
        data-editor-tabs=""
        variant="line"
      >
        {tabs.map((tab) => {
          const invalid = tab.fields?.some((field) => {
            const errors = form?.getError(field);
            return Array.isArray(errors) ? errors.length > 0 : Boolean(errors);
          });
          return (
            <TabsTrigger
              key={tab.id}
              className="h-full min-w-max shrink-0 rounded-none px-4"
              data-invalid={invalid || undefined}
              value={tab.id}
            >
              {tab.label}

              {invalid && (
                <>
                  <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-destructive" data-tab-error-dot="" />

                  <span className="sr-only">{t("EditorTabs.invalid")}</span>
                </>
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>

      {tabs.map((tab) => (
        <TabsContent key={tab.id} className={cn("m-0 min-h-0", contentClassName)} value={tab.id}>
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
});
