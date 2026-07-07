"use client";

import type { ContactDto } from "@/features/contacts/contact.schema";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { ColumnDef } from "@tanstack/react-table";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { EntityType, TaskType } from "@/generated/prisma";

import { Avatar } from "@/components/ui/avatar";
import { AppChipStack } from "@/components/chip/app-chip-stack";
import { ChannelIconStack } from "./channel-icon-stack";
import { channelDisplayLabel } from "@/ee/messaging/thread-display";
import { DataViewContainer, standardTailColumns, useDataViewSync } from "@/components/data-view";
import { useEntityHref, useOpenEntity } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useCopyToClipboard } from "@/core/utils/use-copy-to-clipboard";
import { getSystemTaskNameTranslationKey } from "../../tasks/components/system-task.config";

type Props = {
  contacts: GetResult<ContactDto>;
};

export const ContactsCard = observer(({ contacts }: Props) => {
  const { contactsStore, organizationsStore, userModalStore, dealsStore, intlStore } = useRootStore();
  const openEntity = useOpenEntity();
  const entityHref = useEntityHref();
  const t = useTranslations();
  const copy = useCopyToClipboard();

  useDataViewSync(contactsStore, contacts, [dealsStore, organizationsStore]);

  const columns = useMemo<ColumnDef<ContactDto>[]>(() => {
    return [
      {
        id: "name",
        cell: ({ row }) => {
          const fullName = `${row.original.firstName} ${row.original.lastName}`.trim();
          const pictureUrl = row.original.avatarUrl ?? null;
          return (
            <div className="flex gap-2 items-center justify-start">
              <Avatar name={fullName} src={pictureUrl} />

              <span className="text-sm truncate">{fullName}</span>
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
              void copy(
                channelDisplayLabel(item.provider, item.value, item.profileUrl) || item.displayName || item.value,
              )
            }
          />
        ),
      },
      {
        id: "organizations",
        cell: ({ row }) => (
          <AppChipStack
            chipHref={(org) => entityHref(EntityType.organization, org.id)}
            items={row.original.organizations.map((org) => ({
              id: org.id,
              label: org.name,
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
    ];
  }, [contactsStore, contactsStore.customColumns, openEntity, entityHref, userModalStore, intlStore, t, copy]);

  return (
    <DataViewContainer
      anchorScope="contacts"
      columns={columns}
      rowHref={(item) => entityHref(EntityType.contact, item.id)}
      store={contactsStore}
      onAdd={() => openEntity(EntityType.contact, "new")}
    />
  );
});
