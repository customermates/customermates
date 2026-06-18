"use client";

import type { ContactIdentifierDto } from "@/features/contacts/contact.schema";

import { useTranslations } from "next-intl";

import { OverlappingStack } from "@/components/shared/overlapping-stack";
import { StackDropdownItem } from "@/components/shared/stack-dropdown-item";
import { getProviderIcon } from "@/ee/messaging/provider-icon";
import { channelDisplayLabel } from "@/ee/messaging/thread-display";

type Props = {
  identifiers: ContactIdentifierDto[];
  maxVisible?: number;
  className?: string;
  onItemClick?: (identifier: ContactIdentifierDto) => void;
};

export function ChannelIconStack({ identifiers, maxVisible = 3, className, onItemClick }: Props) {
  const t = useTranslations();
  const providers = [...new Set(identifiers.map((id) => id.provider))];

  return (
    <OverlappingStack
      badgeKey={(provider) => provider}
      badges={providers}
      className={className}
      contentAlign="start"
      maxVisible={maxVisible}
      renderBadge={(provider) => {
        const Icon = getProviderIcon(provider);
        return (
          <span
            className="bg-foreground/10 dark:bg-foreground/15 flex size-6 items-center justify-center overflow-hidden rounded-full"
            title={t(`Common.providers.${provider}`)}
          >
            <Icon className="size-6" />
          </span>
        );
      }}
      renderOverflow={(count) => (
        <span className="bg-foreground/10 dark:bg-foreground/15 text-foreground/70 flex size-6 items-center justify-center rounded-full text-[10px]">
          +{count}
        </span>
      )}
      renderRow={(id, close) => {
        const Icon = getProviderIcon(id.provider);
        const providerLabel = t(`Common.providers.${id.provider}`);
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
