import { useTranslations } from "next-intl";

import type { MessagingProvider } from "@/generated/prisma";

import { Avatar } from "@/components/ui/avatar";

import { BackToInboxButton } from "./back-to-inbox-button";

type Props = {
  title: string;
  subtitle: string | null;
  pictureUrl: string | null;
  unlinked?: boolean;
  provider: MessagingProvider;
  rightSlot?: React.ReactNode;
};

export function ThreadHeader({ title, subtitle, pictureUrl, unlinked, provider, rightSlot }: Props) {
  const t = useTranslations();
  const providerLabel = t(`Common.providers.${provider}`);

  return (
    <div className="border-border shrink-0 border-b px-4 py-3">
      <div className="flex flex-wrap items-center gap-2 lg:gap-3">
        <BackToInboxButton />

        <Avatar
          name={title}
          size="lg"
          src={pictureUrl}
          unlinked={unlinked}
          unlinkedLabel={t("Inbox.unlinkedParticipants")}
        />

        <div className="min-w-0 flex-1">
          <span className="text-muted-foreground text-[11px] font-medium">{providerLabel}</span>

          <h2 className="truncate text-sm font-semibold">{title}</h2>

          {subtitle && <p className="text-muted-foreground truncate text-xs">{subtitle}</p>}
        </div>

        {rightSlot && <div className="flex shrink-0 flex-wrap items-center gap-1">{rightSlot}</div>}
      </div>
    </div>
  );
}
