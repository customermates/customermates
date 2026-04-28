import type { GetResult } from "@/core/base/base-get.interactor";
import type { GetQueryParams, Filter } from "@/core/base/base-get.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CustomColumnType, Status, TaskType } from "@/generated/prisma";

import { isCustomField } from "@/components/data-view/table-view.utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { getSystemTaskNameTranslationKey } from "@/app/[locale]/(protected)/tasks/components/system-task.config";
import { DomainEvent } from "@/features/event/domain-events";

export type FilterSelectItem = {
  key: string;
  value: string;
  textValue: string;
  color?: ChipColor;
  startContent?: React.ReactNode;
};

type GetItemsFunction = (params: GetQueryParams) => Promise<GetResult<FilterSelectItem>>;

function initials(first?: string | null, last?: string | null): string {
  return `${(first ?? "").charAt(0)}${(last ?? "").charAt(0)}`.trim().toUpperCase();
}

function renderAvatar(name: string, src?: string | null) {
  return (
    <Avatar className="mr-0.5 size-4">
      {src ? <AvatarImage src={src} /> : null}

      <AvatarFallback className="text-[8px]">{initials(name.split(" ")[0], name.split(" ")[1])}</AvatarFallback>
    </Avatar>
  );
}

// TODO check for refactoring
export function useFilterSelectItems(
  filter: Filter,
  customColumns?: CustomColumnDto[],
): {
  items: FilterSelectItem[];
  getItems?: GetItemsFunction;
  isLoading: boolean;
} {
  const t = useTranslations("");
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
      [FilterFieldKey.contactIds]: (params) =>
        getContactsAction(params).then((res) => ({
          items: res.items.map((contact) => {
            const name = `${contact.firstName} ${contact.lastName}`.trim();
            return {
              key: contact.id,
              value: contact.id,
              textValue: name,
              startContent: renderAvatar(name),
            };
          }),
        })),
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
    };

    if (isCustom) return undefined;

    const enumValue = Object.values(FilterFieldKey).find((key) => key === (field as FilterFieldKey));
    return enumValue ? fieldToGetItemsMap[enumValue] : undefined;
  }, [field, isCustom, t]);

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
      case FilterFieldKey.taskIds: {
        return fetchedItems;
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
      case FilterFieldKey.updatedAt: {
        return [];
      }

      default:
        return [];
    }
  }, [field, isCustom, fetchedItems, customColumns, t]);

  return { items, getItems, isLoading };
}
