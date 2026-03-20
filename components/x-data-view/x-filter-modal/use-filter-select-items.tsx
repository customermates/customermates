import type { GetResult } from "@/core/base/base-get.interactor";
import type { GetQueryParams, Filter } from "@/core/base/base-get.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { Avatar } from "@heroui/avatar";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CustomColumnType, Status } from "@/generated/prisma";

import { isCustomField } from "../x-table-view/x-table-view.utils";

import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { type ChipColor } from "@/constants/chip-colors";
import { getUsersAction } from "@/app/[locale]/(protected)/company/actions";
import { getContactsAction } from "@/app/[locale]/(protected)/contacts/actions";
import { getOrganizationsAction } from "@/app/[locale]/(protected)/organizations/actions";
import { getDealsAction } from "@/app/[locale]/(protected)/deals/actions";
import { getServicesAction } from "@/app/[locale]/(protected)/services/actions";
import { DomainEvent } from "@/features/event/domain-events";

export type FilterSelectItem = {
  key: string;
  value: string;
  textValue: string;
  color?: ChipColor;
  startContent?: React.ReactNode;
};

type GetItemsFunction = (params: GetQueryParams) => Promise<GetResult<FilterSelectItem>>;

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
          items: res.items.map((user) => ({
            key: user.id,
            value: user.id,
            textValue: `${user.firstName} ${user.lastName}`.trim(),
            startContent: (
              <Avatar
                showFallback
                className="max-w-4 max-h-4 text-[8px] mr-0.5"
                name={`${user.firstName} ${user.lastName}`.trim()}
                src={user.avatarUrl ?? undefined}
              />
            ),
          })),
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
          items: res.items.map((contact) => ({
            key: contact.id,
            value: contact.id,
            textValue: `${contact.firstName} ${contact.lastName}`.trim(),
            startContent: (
              <Avatar
                showFallback
                className="max-w-4 max-h-4 text-[8px] mr-0.5"
                name={`${contact.firstName} ${contact.lastName}`.trim()}
              />
            ),
          })),
        })),
    };

    if (isCustom) return undefined;

    const enumValue = Object.values(FilterFieldKey).find((key) => key === (field as FilterFieldKey));
    return enumValue ? fieldToGetItemsMap[enumValue] : undefined;
  }, [field, isCustom]);

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
      case FilterFieldKey.contactIds: {
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
