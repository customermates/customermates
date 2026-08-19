"use client";

import type { ContactIdentifierDto } from "@/features/contacts/contact.schema";

import { useTranslations } from "next-intl";

import { OverlappingStack } from "@/components/shared/overlapping-stack";
import { StackDropdownItem } from "@/components/shared/stack-dropdown-item";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { channelLabelKey } from "@/ee/messaging/provider";
import { getChannelIcon } from "@/ee/messaging/provider-icon";
import { channelDisplayLabel } from "@/ee/messaging/thread-display";

type Props = {
  identifiers: ContactIdentifierDto[];
  maxVisible?: number;
  className?: string;
  onItemClick?: (identifier: ContactIdentifierDto) => void;
};

export function ChannelIconStack({ identifiers, maxVisible = 3, className, onItemClick }: Props) {
  const t = useTranslations();
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
        const primaryLabel =
          channelDisplayLabel(id.provider, id.value, id.profileUrl) || id.displayName || providerLabel;
        return (
          <StackDropdownItem close={close} onActivate={() => onItemClick?.(id)}>
            <Icon className="size-6" />

            <div className="flex w-full min-w-0 flex-col items-start space-y-0">
              <span className="text-muted-foreground text-[11px] font-medium">{providerLabel}</span>

              <span className="max-w-[18rem] truncate text-sm font-medium">{primaryLabel}</span>
            </div>
          </StackDropdownItem>
        );
      }}
      rowKey={(id) => id.id}
      rows={identifiers}
    />
  );
}
