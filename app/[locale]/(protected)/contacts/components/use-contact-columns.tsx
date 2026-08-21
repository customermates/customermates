"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { ContactDto } from "@/features/contacts/contact.schema";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { EntityType, TaskType } from "@/generated/prisma";

import { AppChipStack } from "@/components/chip/app-chip-stack";
import { standardTailColumns } from "@/components/data-view/standard-columns";
import { useEntityHref } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { Avatar } from "@/components/ui/avatar";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useCopyToClipboard } from "@/core/utils/use-copy-to-clipboard";
import { channelDisplayLabel } from "@/ee/messaging/thread-display";
import { runUserAction } from "@/core/errors/report-application-error";

import { getSystemTaskNameTranslationKey } from "../../tasks/components/system-task.config";
import { ChannelIconStack } from "./channel-icon-stack";

export function useContactColumns(): ColumnDef<ContactDto>[] {
  const { contactsStore, intlStore, userModalStore } = useRootStore();
  const entityHref = useEntityHref();
  const t = useTranslations();
  const copy = useCopyToClipboard();

  return useMemo<ColumnDef<ContactDto>[]>(
    () => [
      {
        id: "name",
        cell: ({ row }) => {
          const fullName = `${row.original.firstName} ${row.original.lastName}`.trim();
          const pictureUrl = row.original.avatarUrl ?? null;
          return (
            <div className="flex items-center justify-start gap-2">
              <Avatar name={fullName} src={pictureUrl} />

              <span className="truncate text-sm">{fullName}</span>
            </div>
          );
        },
      },
      {
        id: "channels",
        cell: ({ row }) => (
          <ChannelIconStack
            identifiers={row.original.identifiers ?? []}
            onItemClick={(item) =>
              runUserAction(() =>
                copy(channelDisplayLabel(item.provider, item.value, item.profileUrl) || item.displayName || item.value),
              )
            }
          />
        ),
      },
      {
        id: "organizations",
        cell: ({ row }) => (
          <AppChipStack
            chipHref={(organization) => entityHref(EntityType.organization, organization.id)}
            items={row.original.organizations.map((organization) => ({
              id: organization.id,
              label: organization.name,
            }))}
            size="sm"
          />
        ),
      },
      {
        id: "deals",
        cell: ({ row }) => (
          <AppChipStack
            chipHref={(deal) => entityHref(EntityType.deal, deal.id)}
            items={row.original.deals.map((deal) => ({
              id: deal.id,
              label: deal.name,
            }))}
            size="sm"
          />
        ),
      },
      {
        id: "tasks",
        cell: ({ row }) => (
          <AppChipStack
            chipHref={(task) => entityHref(EntityType.task, task.id)}
            items={row.original.tasks.map((task) => {
              const nameKey = getSystemTaskNameTranslationKey(task.type);
              const label = nameKey && task.type !== TaskType.custom ? t(nameKey) : task.name;
              return { id: task.id, label };
            })}
            size="sm"
          />
        ),
      },
      ...standardTailColumns({
        store: contactsStore,
        intlStore,
        userModalStore,
      }),
    ],
    [contactsStore, contactsStore.customColumns, copy, entityHref, intlStore, t, userModalStore],
  );
}
