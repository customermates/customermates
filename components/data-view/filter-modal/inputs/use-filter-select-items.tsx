import type { GetResult } from "@/core/base/base-get.interactor";
import type { GetQueryParams, Filter } from "@/core/base/base-get.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { ActivityThreadOptionsData } from "@/ee/messaging/activities/get-activity-thread-options.interactor";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { z } from "zod";
import {
  ConnectedAccountStatus,
  CustomColumnType,
  EntityType,
  MessagingProvider,
  MessagingThreadState,
  Status,
  SubscriptionPlan,
  SubscriptionStatus,
  TaskType,
} from "@/generated/prisma";

import { isCustomField } from "@/components/data-view/table-view.utils";
import { useActivityQuery } from "@/features/messaging/activities/activity-query-context";
import { getProviderIcon } from "@/ee/messaging/provider-icon";
import { Avatar } from "@/components/ui/avatar";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { type ChipColor } from "@/constants/chip-colors";
import { USER_STATUS_COLORS_MAP } from "@/constants/user-statuses";
import { SUBSCRIPTION_STATUS_COLOR_MAP } from "@/app/[locale]/(protected)/company/components/subscription/subscription-panel";
import { OPERATOR_AUDIT_SOURCE } from "@/ee/operator/operator-lists.schema";
import { getUsersAction } from "@/app/[locale]/(protected)/company/actions";
import { getContactsAction } from "@/app/[locale]/(protected)/contacts/actions";
import { getOrganizationsAction } from "@/app/[locale]/(protected)/organizations/actions";
import { getDealsAction } from "@/app/[locale]/(protected)/deals/actions";
import { getServicesAction } from "@/app/[locale]/(protected)/services/actions";
import { getTasksAction } from "@/app/[locale]/(protected)/tasks/actions";
import {
  getOperatorWorkspacesAction,
  getOperatorWorkspaceTagsAction,
} from "@/app/[locale]/(protected)/operator/actions";
import {
  getActivityRecordOptionsAction,
  getActivityThreadOptionsAction,
  getConnectedAccountsAction,
} from "@/app/[locale]/(protected)/actions";
import { getSystemTaskNameTranslationKey } from "@/app/[locale]/(protected)/tasks/components/system-task.config";
import {
  THREAD_STATE_CHIP_COLOR,
  ThreadStateDot,
} from "@/app/[locale]/(protected)/inbox/components/thread-state-visuals";
import { DomainEvent } from "@/features/event/domain-events";
import { ACTIVITY_FILTER_VALUE_MAX, ActivityFilterSchema } from "@/ee/messaging/activities/activities.schema";
import { activityEntityTypeForFilterField } from "@/ee/messaging/activities/activity-filterable-fields";

export type FilterSelectItem = {
  key: string;
  value: string;
  textValue: string;
  color?: ChipColor;
  startContent?: React.ReactNode;
};

type GetItemsFunction = (params: GetQueryParams) => Promise<GetResult<FilterSelectItem>>;
type ResolveItemsFunction = (ids: readonly string[]) => Promise<FilterSelectItem[]>;

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

const RecordOptionIdSchema = z.uuid();

function validActivityFilters(filters: Filter[] | undefined): NonNullable<ActivityThreadOptionsData["filters"]> {
  return (filters ?? []).flatMap((filter) => {
    const candidate =
      filter.operator === FilterOperatorKey.hasSome || filter.operator === FilterOperatorKey.hasNone
        ? { field: filter.field, operator: filter.operator }
        : filter;
    const parsed = ActivityFilterSchema.safeParse(candidate);
    return parsed.success ? [parsed.data] : [];
  });
}

const SELECTION_RESOLUTION_PAGE_SIZE = 100;

const SELF_IDENTIFYING_FILTER_FIELDS = new Set<FilterFieldKey>([FilterFieldKey.workspaceId]);

export function useFilterSelectItems(
  filter: Filter,
  customColumns?: CustomColumnDto[],
): {
  items: FilterSelectItem[];
  getItems?: GetItemsFunction;
  isLoading: boolean;
  maxSelectedValues?: number;
  selectionError: boolean;
  retrySelection: () => void;
  scopeKey: string;
} {
  const t = useTranslations();
  const activityQuery = useActivityQuery();
  const activityQueryRef = useRef(activityQuery);
  activityQueryRef.current = activityQuery;
  const hasActivityQuery = activityQuery !== null;

  const { field } = filter;
  const fieldKey = field as FilterFieldKey;
  const value = "value" in filter ? filter.value : undefined;
  const isCustom = isCustomField(field);
  const timelineScopeKey = JSON.stringify([activityQuery?.scope ?? null, validActivityFilters(activityQuery?.filters)]);
  const scopeKey = fieldKey === FilterFieldKey.timelineThreadId ? timelineScopeKey : String(field);

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
        const activeQuery = activityQueryRef.current;
        return getActivityThreadOptionsAction({
          scope: activeQuery?.scope,
          filters: validActivityFilters(activeQuery?.filters),
        }).then((threads) => ({
          items: threads.map((thread) => ({
            key: thread.id,
            value: thread.id,
            textValue: thread.label || t(`Common.providers.${thread.provider}`),
            startContent: renderProviderIcon(thread.provider, t(`Common.providers.${thread.provider}`)),
          })),
        }));
      },
      [FilterFieldKey.workspaceId]: (params) =>
        getOperatorWorkspacesAction(params).then((res) => ({
          items: res.items.map((workspace) => ({
            key: workspace.id,
            value: workspace.id,
            textValue: workspace.ownerEmail
              ? `${workspace.workspaceLabel} · ${workspace.ownerEmail}`
              : workspace.workspaceLabel,
          })),
        })),
      [FilterFieldKey.workspaceTags]: () =>
        getOperatorWorkspaceTagsAction().then((tags) => ({
          items: tags.map((tag) => ({ key: tag, value: tag, textValue: tag })),
        })),
      [FilterFieldKey.connectedAccountId]: () =>
        getConnectedAccountsAction().then((accounts) => ({
          items: accounts
            .filter((account) => account.status !== ConnectedAccountStatus.deleted)
            .map((account) => {
              const providerLabel = t(`Common.providers.${account.provider}`);
              const base = account.displayName?.trim() || account.emailAddress?.trim() || providerLabel;
              const ownerName = account.isOwner ? null : `${account.owner.firstName} ${account.owner.lastName}`.trim();
              return {
                key: account.id,
                value: account.id,
                textValue: ownerName ? `${base} · ${ownerName}` : base,
                startContent: renderProviderIcon(account.provider, providerLabel),
              };
            }),
        })),
    };

    if (isCustom) return undefined;

    const enumValue = Object.values(FilterFieldKey).find((key) => key === (field as FilterFieldKey));
    return enumValue ? fieldToGetItemsMap[enumValue] : undefined;
  }, [field, isCustom, t, timelineScopeKey]);

  const getSelectedItems = useMemo<ResolveItemsFunction | undefined>(() => {
    if (!hasActivityQuery) return undefined;
    const entityType = activityEntityTypeForFilterField(field);
    if (!entityType) return undefined;
    const withAvatar = entityType === EntityType.contact;

    return (ids) => {
      const requestIds = [...new Set(ids.filter((id) => RecordOptionIdSchema.safeParse(id).success))].slice(
        0,
        ACTIVITY_FILTER_VALUE_MAX,
      );
      if (requestIds.length === 0) return Promise.resolve([]);
      return getActivityRecordOptionsAction({ records: [{ entityType, ids: requestIds }] }).then((options) =>
        options.map((option) => ({
          key: option.id,
          value: option.id,
          textValue: option.label,
          startContent: withAvatar ? renderAvatar(option.label, option.avatarUrl ?? undefined) : undefined,
        })),
      );
    };
  }, [hasActivityQuery, field]);

  const resolveItems = useMemo<ResolveItemsFunction | undefined>(() => {
    if (getSelectedItems) return getSelectedItems;

    if (!getItems) return undefined;

    const selfIdentifyingField = SELF_IDENTIFYING_FILTER_FIELDS.has(fieldKey) ? fieldKey : null;

    return async (ids) => {
      const requested = new Set(ids);
      const params: GetQueryParams = selfIdentifyingField
        ? { filters: [{ field: selfIdentifyingField, operator: FilterOperatorKey.in, value: [...ids] }] }
        : { pagination: { page: 1, pageSize: SELECTION_RESOLUTION_PAGE_SIZE } };
      const result = await getItems(params);
      return result.items.filter((item) => requested.has(item.key));
    };
  }, [fieldKey, getItems, getSelectedItems]);

  const [selectionAttempt, setSelectionAttempt] = useState(0);
  const selectionRequestKey =
    resolveItems && Array.isArray(value) && value.length > 0
      ? JSON.stringify([scopeKey, value.map((item) => String(item)), selectionAttempt])
      : null;
  const [selectionResult, setSelectionResult] = useState<{
    key: string;
    resolver: ResolveItemsFunction;
    status: "success" | "error";
    items: FilterSelectItem[];
  } | null>(null);
  const isLoading =
    selectionRequestKey !== null &&
    (selectionResult?.key !== selectionRequestKey || selectionResult.resolver !== resolveItems);
  const selectionError =
    selectionResult?.key === selectionRequestKey &&
    selectionResult.resolver === resolveItems &&
    selectionResult.status === "error";
  const fetchedItems =
    selectionResult?.key === selectionRequestKey &&
    selectionResult.resolver === resolveItems &&
    selectionResult.status === "success"
      ? selectionResult.items
      : [];
  const retrySelection = useCallback(() => setSelectionAttempt((attempt) => attempt + 1), []);

  useEffect(() => {
    if (!resolveItems || selectionRequestKey === null) return;
    let active = true;
    const [, ids] = JSON.parse(selectionRequestKey) as [string, string[], number];

    void resolveItems(ids)
      .then((resolvedItems) => {
        if (active) {
          setSelectionResult({
            key: selectionRequestKey,
            resolver: resolveItems,
            status: "success",
            items: resolvedItems,
          });
        }
      })
      .catch(() => {
        if (active) {
          setSelectionResult({
            key: selectionRequestKey,
            resolver: resolveItems,
            status: "error",
            items: [],
          });
        }
      });

    return () => {
      active = false;
    };
  }, [resolveItems, selectionRequestKey]);

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
      case FilterFieldKey.connectedAccountId:
      case FilterFieldKey.workspaceId:
      case FilterFieldKey.workspaceTags: {
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

      case FilterFieldKey.plan: {
        return Object.values(SubscriptionPlan).map((plan) => ({
          key: plan,
          value: plan,
          textValue: t(`Subscription.planNames.${plan}`),
        }));
      }

      case FilterFieldKey.subscriptionStatus: {
        return Object.values(SubscriptionStatus).map((status) => ({
          key: status,
          value: status,
          textValue: t(`Subscription.status.${status}`),
          color: SUBSCRIPTION_STATUS_COLOR_MAP[status],
        }));
      }

      case FilterFieldKey.isPlatformOperator: {
        return [
          { key: "true", value: "true", textValue: t("OperatorUsers.values.operator") },
          { key: "false", value: "false", textValue: t("OperatorUsers.platformAccess.revoked") },
        ];
      }

      case FilterFieldKey.auditSource: {
        return [
          {
            key: OPERATOR_AUDIT_SOURCE.product,
            value: OPERATOR_AUDIT_SOURCE.product,
            textValue: t("OperatorAudit.values.source.product"),
          },
          {
            key: OPERATOR_AUDIT_SOURCE.operator,
            value: OPERATOR_AUDIT_SOURCE.operator,
            textValue: t("OperatorAudit.values.source.operator"),
          },
        ];
      }

      case FilterFieldKey.createdAt:
      case FilterFieldKey.updatedAt:
      case FilterFieldKey.lastActiveAt:
      case FilterFieldKey.participants: {
        return [];
      }

      default:
        return [];
    }
  }, [field, isCustom, fetchedItems, customColumns, t]);

  return {
    items,
    getItems,
    isLoading,
    maxSelectedValues: hasActivityQuery ? ACTIVITY_FILTER_VALUE_MAX : undefined,
    selectionError,
    retrySelection,
    scopeKey,
  };
}
