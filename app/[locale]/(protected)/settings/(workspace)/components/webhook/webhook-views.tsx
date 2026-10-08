"use client";

import { SegmentedControl, SegmentedControlPanel } from "@/components/ui/segmented-control";
import { usePathname, useRouter } from "@/i18n/navigation";
import { WEBHOOK_DELIVERIES_HREF, settingsHref } from "@/app/components/navigation/settings-routes";

type Props = {
  labels: { views: string; webhooks: string; deliveries: string };
  children: React.ReactNode;
};

export function WebhookViews({ labels, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const active = pathname.startsWith(WEBHOOK_DELIVERIES_HREF) ? WEBHOOK_DELIVERIES_HREF : settingsHref("webhooks");

  return (
    <SegmentedControl
      className="min-h-0 flex-1 gap-0"
      idPrefix="settings-webhooks-views"
      items={[
        { value: settingsHref("webhooks"), label: labels.webhooks },
        { value: WEBHOOK_DELIVERIES_HREF, label: labels.deliveries },
      ]}
      label={labels.views}
      listClassName="mx-4 mt-3 w-auto max-w-xs md:mx-6"
      value={active}
      onValueChange={(href) => router.push(href)}
    >
      <SegmentedControlPanel className="flex flex-col" value={active}>
        {children}
      </SegmentedControlPanel>
    </SegmentedControl>
  );
}
