import type { GetResult } from "@/core/base/base-get.interactor";
import type { GetQueryParams, Filter } from "@/core/base/base-get.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CustomColumnType, MessagingProvider, MessagingThreadState, Status, TaskType } from "@/generated/prisma";

import { isCustomField } from "@/components/data-view/table-view.utils";
import { useRootStore } from "@/core/stores/root-store.provider";
import { getProviderIcon } from "@/ee/messaging/provider-icon";
import { Avatar } from "@/components/ui/avatar";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { type ChipColor } from "@/constants/chip-colors";
import { USER_STATUS_COLORS_MAP } from "@/constants/user-statuses";
import { getUsersAction } from "@/app/[locale]/(protected)/company/actions";
import { getContactsAction } from "@/app/[locale]/(protected)/contacts/actions";
import { getOrganizationsAction } from "@/app/[locale]/(protected)/organizations/actions";
import { getDealsAction } from "@/app/[locale]/(protected)/deals/actions";
import { getServicesAction } from "@/app/[locale]/(protected)/services/actions";
import { getTasksAction } from "@/app/[locale]/(protected)/tasks/actions";
import { getActivityThreadOptionsAction, getActivityChannelOptionsAction } from "@/app/[locale]/(protected)/actions";
import { getSystemTaskNameTranslationKey } from "@/app/[locale]/(protected)/tasks/components/system-task.config";
import {
  THREAD_STATE_CHIP_COLOR,
  ThreadStateDot,
} from "@/app/[locale]/(protected)/inbox/components/thread-state-visuals";
import { DomainEvent } from "@/features/event/domain-events";

export type FilterSelectItem = {
  key: string;
  value: string;
  textValue: string;
  color?: ChipColor;
  startContent?: React.ReactNode;
};

type GetItemsFunction = (params: GetQueryParams) => Promise<GetResult<FilterSelectItem>>;

function renderAvatar(name: string, src?: string | null) {
  return <Avatar className="mr-0.5" name={name} size="sm" src={src} />;
}

const contactItems: GetItemsFunction = (params) =>
  getContactsAction(params).then((res) => ({
    items: res.items.map((contact) => {
      const name = `${contact.firstName} ${contact.lastName}`.trim();
      return {
        key: contact.id,
        value: contact.id,
        textValue: name,
        startContent: renderAvatar(name, contact.avatarUrl ?? undefined),
      };
    }),
  }));

function renderProviderIcon(provider: string, label: string) {
  const ProviderIcon = getProviderIcon(provider as MessagingProvider);
  return <ProviderIcon aria-label={label} className="size-4 shrink-0" />;
}

function selectedChannelIds(filters: Filter[] | undefined): string[] | undefined {
  const filter = filters?.find(
    (f) => (f.field as FilterFieldKey) === FilterFieldKey.connectedAccountId && f.operator === FilterOperatorKey.in,
  );
  if (!filter || !("value" in filter) || !Array.isArray(filter.value) || filter.value.length === 0) return undefined;
  return filter.value;
}

export function useFilterSelectItems(
  filter: Filter,
  customColumns?: CustomColumnDto[],
): {
  items: FilterSelectItem[];
  getItems?: GetItemsFunction;
  isLoading: boolean;
} {
  const t = useTranslations();
  const { activitiesStore } = useRootStore();
  const [fetchedItems, setFetchedItems] = useState<FilterSelectItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const { field } = filter;
  const value = "value" in filter ? filter.value : undefined;
  const isCustom = isCustomField(field);

  const getItems = useMemo(() => {
    const fieldToGetItemsMap: Partial<Record<FilterFieldKey, GetItemsFunction>> = {
      [FilterFieldKey.userIds]: (params) =>
        getUsersAction(params).then((res) => ({
          items: res.items.map((user) => {
            const name = `${user.firstName} ${user.lastName}`.trim();
            return {
              key: user.id,
              value: user.id,
              textValue: name,
              startContent: renderAvatar(name, user.avatarUrl ?? undefined),
            };
          }),
        })),
      [FilterFieldKey.serviceIds]: (params) =>
        getServicesAction(params).then((res) => ({
          items: res.items.map((service) => ({
            key: service.id,
            value: service.id,
            textValue: service.name,
          })),
        })),
      [FilterFieldKey.dealIds]: (params) =>
        getDealsAction(params).then((res) => ({
          items: res.items.map((deal) => ({
            key: deal.id,
            value: deal.id,
            textValue: deal.name,
          })),
        })),
      [FilterFieldKey.organizationIds]: (params) =>
        getOrganizationsAction(params).then((res) => ({
          items: res.items.map((organization) => ({
            key: organization.id,
            value: organization.id,
            textValue: organization.name,
          })),
        })),
      [FilterFieldKey.contactIds]: contactItems,
      [FilterFieldKey.participantContactId]: contactItems,
      [FilterFieldKey.taskIds]: (params) =>
        getTasksAction(params).then((res) => ({
          items: res.items.map((task) => {
            const nameKey = getSystemTaskNameTranslationKey(task.type);
            const label = nameKey && task.type !== TaskType.custom ? t(nameKey) : task.name;
            return {
              key: task.id,
              value: task.id,
              textValue: label,
            };
          }),
        })),
      [FilterFieldKey.timelineThreadId]: () => {
        const { timelineEntityType, timelineEntityId } = activitiesStore;

        return getActivityThreadOptionsAction({
          entityType: timelineEntityType ?? undefined,
          entityId: timelineEntityId || undefined,
          connectedAccountId: selectedChannelIds(activitiesStore.filters),
        }).then((threads) => ({
          items: threads.map((thread) => ({
            key: thread.id,
            value: thread.id,
            textValue: thread.label || t(`Common.providers.${thread.provider}`),
            startContent: renderProviderIcon(thread.provider, t(`Common.providers.${thread.provider}`)),
          })),
        }));
      },
      [FilterFieldKey.connectedAccountId]: () => {
        const { timelineEntityType, timelineEntityId } = activitiesStore;

        return getActivityChannelOptionsAction({
          entityType: timelineEntityType ?? undefined,
          entityId: timelineEntityId || undefined,
        }).then((channels) => ({
          items: channels.map((channel) => {
            const providerLabel = t(`Common.providers.${channel.provider}`);
            const base = channel.label || providerLabel;
            return {
              key: channel.id,
              value: channel.id,
              textValue: channel.ownerName ? `${base} · ${channel.ownerName}` : base,
              startContent: renderProviderIcon(channel.provider, providerLabel),
            };
          }),
        }));
      },
    };

    if (isCustom) return undefined;

    const enumValue = Object.values(FilterFieldKey).find((key) => key === (field as FilterFieldKey));
    return enumValue ? fieldToGetItemsMap[enumValue] : undefined;
  }, [field, isCustom, t, activitiesStore]);

  useEffect(() => {
    if (!Array.isArray(value)) {
      setFetchedItems([]);
      setIsLoading(false);
      return;
    }

    async function fetchItems() {
      if (!getItems) return;

      const ids = Array.isArray(value) ? [...value] : [];

      if (ids.length === 0) {
        setFetchedItems([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      try {
        const res = await getItems({
          filters: [{ field, operator: FilterOperatorKey.in, value: ids }],
        });
        setFetchedItems(res.items);
      } catch {
        setFetchedItems([]);
      } finally {
        setIsLoading(false);
      }
    }

    void fetchItems();
  }, [field, value, getItems]);

  const items = useMemo<FilterSelectItem[]>(() => {
    if (isCustom) {
      const customColumn = customColumns?.find((col) => col.id === field);

      if (customColumn && customColumn.type === CustomColumnType.singleSelect) {
        const options = customColumn.options?.options || [];
        return options.map((opt) => ({
          key: String(opt.value),
          value: String(opt.value),
          textValue: opt.label,
          color: opt.color,
        }));
      }

      return [];
    }

    const enumValue = Object.values(FilterFieldKey).find((key) => key === (field as FilterFieldKey));
    if (!enumValue) return [];

    switch (enumValue) {
      case FilterFieldKey.userIds:
      case FilterFieldKey.serviceIds:
      case FilterFieldKey.dealIds:
      case FilterFieldKey.organizationIds:
      case FilterFieldKey.contactIds:
      case FilterFieldKey.participantContactId:
      case FilterFieldKey.taskIds:
      case FilterFieldKey.timelineThreadId:
      case FilterFieldKey.connectedAccountId: {
        return fetchedItems;
      }

      case FilterFieldKey.provider: {
        return Object.values(MessagingProvider).map((provider) => ({
          key: provider,
          value: provider,
          textValue: t(`Common.providers.${provider}`),
          startContent: renderProviderIcon(provider, t(`Common.providers.${provider}`)),
        }));
      }

      case FilterFieldKey.timelineKind: {
        return (["changes", "messages", "activities"] as const).map((type) => ({
          key: type,
          value: type,
          textValue: t(`EntityTimeline.types.${type}`),
        }));
      }

      case FilterFieldKey.state: {
        return Object.values(MessagingThreadState).map((state) => ({
          key: state,
          value: state,
          textValue: t(`Inbox.threadStates.${state}`),
          color: THREAD_STATE_CHIP_COLOR[state],
          startContent: <ThreadStateDot className="size-1.5" state={state} />,
        }));
      }

      case FilterFieldKey.event: {
        return Object.values(DomainEvent).map((event) => {
          return {
            key: event,
            value: event,
            textValue: t(`Common.events.${event}`),
          };
        });
      }

      case FilterFieldKey.status: {
        return Object.values(Status).map((status) => {
          return {
            key: status,
            value: status,
            textValue: t(`Common.userStatuses.${status}`),
            color: USER_STATUS_COLORS_MAP[status],
          };
        });
      }

      case FilterFieldKey.createdAt:
      case FilterFieldKey.updatedAt:
      case FilterFieldKey.participants: {
        return [];
      }

      default:
        return [];
    }
  }, [field, isCustom, fetchedItems, customColumns, t]);

  return { items, getItems, isLoading };
}
