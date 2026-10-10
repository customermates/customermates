"use client";

import type { RecordIdentity } from "@/features/records/record-identity.schema";

import type { ContactClickAction } from "@/components/records/contact-value";

import { Copy } from "lucide-react";
import { useTranslations } from "next-intl";

import { OverlappingStack } from "@/components/shared/overlapping-stack";
import { StackDropdownItem } from "@/components/shared/stack-dropdown-item";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { runUserAction } from "@/core/errors/report-application-error";
import { contactHref } from "@/core/utils/contact-href";
import { useCopyToClipboard } from "@/core/utils/use-copy-to-clipboard";
import { channelLabelKey } from "@/ee/messaging/provider";
import { getChannelIcon } from "@/ee/messaging/provider-icon";
import { channelContact } from "@/ee/messaging/thread-display";

type ChannelIdentity = Pick<RecordIdentity, "id" | "provider" | "value" | "displayName" | "profileUrl">;
type Props = {
  identifiers: ChannelIdentity[];
  action?: ContactClickAction;
  maxVisible?: number;
  className?: string;
};

export function ChannelIconStack({ identifiers, action = "open", maxVisible = 3, className }: Props) {
  const t = useTranslations();
  const copy = useCopyToClipboard();
  const channels = [...new Map(identifiers.map((id) => [channelLabelKey(id.provider), id.provider])).values()];

  return (
    <OverlappingStack
      badgeKey={(provider) => channelLabelKey(provider)}
      badges={channels}
      className={className}
      contentAlign="start"
      maxVisible={maxVisible}
      renderBadge={(provider) => {
        const Icon = getChannelIcon(provider);
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="bg-foreground/10 flex size-6 items-center justify-center overflow-hidden rounded-full">
                <Icon className="size-6" />
              </span>
            </TooltipTrigger>

            <TooltipContent>{t(`Common.providers.${channelLabelKey(provider)}`)}</TooltipContent>
          </Tooltip>
        );
      }}
      renderOverflow={(count) => (
        <span className="bg-foreground/10 text-foreground/70 flex size-6 items-center justify-center rounded-full text-[10px]">
          +{count}
        </span>
      )}
      renderRow={(id, close) => {
        const Icon = getChannelIcon(id.provider);
        const providerLabel = t(`Common.providers.${channelLabelKey(id.provider)}`);
        const contact = channelContact(id.provider, id.value, id.profileUrl);
        const primaryLabel = contact.label || id.displayName || providerLabel;
        const openTarget = action === "open" ? contactHref(contact.kind, contact.value) : null;
        const copyValue = () => runUserAction(() => copy(contact.value));
        return (
          <div className="flex items-center gap-1">
            <StackDropdownItem
              className="min-w-0 flex-1"
              close={close}
              onActivate={() => {
                if (!openTarget) copyValue();
                else if (contact.kind === "url") window.open(openTarget, "_blank", "noopener,noreferrer");
                else window.location.assign(openTarget);
              }}
            >
              <Icon className="size-6" />

              <div className="flex w-full min-w-0 flex-col items-start space-y-0">
                <span className="text-muted-foreground text-[11px] font-medium">{providerLabel}</span>

                <span className="max-w-[18rem] truncate text-sm font-medium">{primaryLabel}</span>
              </div>
            </StackDropdownItem>

            <StackDropdownItem
              ariaLabel={t("Common.actions.copy")}
              className="shrink-0 text-muted-foreground"
              close={close}
              onActivate={copyValue}
            >
              <Copy aria-hidden className="size-4" />
            </StackDropdownItem>
          </div>
        );
      }}
      rowKey={(id) => id.id}
      rows={identifiers}
      triggerLabel={channels.map((provider) => t(`Common.providers.${channelLabelKey(provider)}`)).join(", ")}
    />
  );
}
