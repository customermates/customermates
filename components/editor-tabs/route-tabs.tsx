"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePathname, useRouter } from "@/i18n/navigation";

import { EDITOR_TAB_LIST_CLASS, EDITOR_TAB_TRIGGER_CLASS } from "./editor-tabs";

type Props = {
  label: string;
  tabs: ReadonlyArray<{ href: string; label: string }>;
  children: React.ReactNode;
};

export function RouteTabs({ label, tabs, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const active = [...tabs].sort((a, b) => b.href.length - a.href.length).find((tab) => pathname.startsWith(tab.href));

  return (
    <Tabs className="min-h-0 flex-1 gap-0" value={active?.href ?? ""} onValueChange={(href) => router.push(href)}>
      <TabsList aria-label={label} className={EDITOR_TAB_LIST_CLASS} data-route-tabs="" variant="line">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.href} className={EDITOR_TAB_TRIGGER_CLASS} value={tab.href}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {tabs.map((tab) => (
        <TabsContent key={tab.href} className="m-0 flex min-h-0 flex-1 flex-col" value={tab.href}>
          {tab.href === active?.href ? children : null}
        </TabsContent>
      ))}
    </Tabs>
  );
}
