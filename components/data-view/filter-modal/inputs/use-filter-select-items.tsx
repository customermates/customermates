import {
  getMessagingThreadsAction,
  getMessagingThreadAction,
  getIdentityRecordChoicesAction,
} from "@/app/[locale]/(protected)/inbox/actions";
import { getRecordChoicesAction, getRecordNavigationAction } from "@/app/[locale]/(protected)/records/actions";
import { resolveSearchReferencesAction } from "@/app/[locale]/(protected)/search/actions";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { Filter, FilterOption, GetQueryParams } from "@/core/base/base-get.schema";
import type { ColumnPresentation } from "@/core/data-view/column-presentation.schema";
import type { RecordRef } from "@/features/records/record-model.schema";
import { parseRecordReferenceKey, recordReferenceKey } from "@/features/records/record-reference-key";
import { recordDisplayName } from "@/features/records/record-display-name";

import {
  ConnectedAccountStatus,
  MessagingProvider,
  MessagingThreadState,
  Status,
  SubscriptionPlan,
  SubscriptionStatus,
} from "@/generated/prisma";
import { CustomColumnType } from "@/core/data-view/column-presentation.types";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import {
  getCalendarsAction,
  getConnectedAccountsAction,
  getMessagingFilterOptionsAction,
} from "@/app/[locale]/(protected)/actions";
import {
  getUsersAction,
  getWebhooksAction,
  resolveUserOptionsAction,
} from "@/app/[locale]/(protected)/settings/(workspace)/actions";
import { SUBSCRIPTION_STATUS_COLOR_MAP } from "@/app/[locale]/(protected)/settings/(workspace)/components/subscription/subscription-panel";
import {
  THREAD_STATE_CHIP_COLOR,
  ThreadStateDot,
} from "@/app/[locale]/(protected)/inbox/components/thread-state-visuals";
import {
  getOperatorWorkspacesAction,
  getOperatorWorkspaceTagsAction,
} from "@/app/[locale]/(protected)/operator/actions";
import { useFilterOptions } from "@/components/data-view/filter-options-context";
import { isCustomField } from "@/components/data-view/table-view.utils";
import { Avatar } from "@/components/ui/avatar";
import { recordTypeIcon } from "@/components/records/record-type-icon";
import { TRASH_KINDS } from "@/features/trash/trash.schema";
import { type ChipColor } from "@/constants/chip-colors";
import { USER_STATUS_COLORS_MAP } from "@/constants/user-statuses";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { TIMELINE_KIND_VIEW_VALUES } from "@/core/types/filter-field-value-kind";
import { ACTIVITY_FILTER_VALUE_MAX, ActivityFilterSchema } from "@/ee/messaging/activities/activities.schema";
import { getProviderIcon } from "@/ee/messaging/provider-icon";
import { OPERATOR_AUDIT_SOURCE } from "@/ee/operator/operator-lists.schema";
import { AD_PROVIDER_ORDER, adProviderDisplayName } from "@/features/acquisition/ad-provider-registry";
import { DomainEvent } from "@/features/event/domain-events";
import { useActivityQuery } from "@/features/messaging/activities/activity-query-context";

export type FilterSelectItem = {
  key: string;
  value: string;
  textValue: string;
  optionLabel?: string;
  groupKey?: string;
  groupLabel?: string;
  color?: ChipColor;
  startContent?: React.ReactNode;
};

type GetItemsFunction = (params: GetQueryParams) => Promise<GetResult<FilterSelectItem>>;
type ResolveItemsFunction = (ids: readonly string[]) => Promise<FilterSelectItem[]>;
type Translate = ReturnType<typeof useTranslations>;
type ActivityQueryRef = { current: ReturnType<typeof useActivityQuery> };

export const NO_FILTER_OPTIONS = null;

export type FilterOptionSource =
  | { getItems: GetItemsFunction }
  | { items: () => FilterSelectItem[] }
  | typeof NO_FILTER_OPTIONS;

function renderAvatar(name: string, src?: string | null) {
  return <Avatar className="mr-0.5" name={name} size="sm" src={src} />;
}

function renderProviderIcon(provider: string, label: string) {
  const ProviderIcon = getProviderIcon(provider as MessagingProvider);
  return <ProviderIcon aria-label={label} className="size-4 shrink-0" />;
}

function scopedOptionItems(options: FilterOption[], field: string, t: Translate): FilterSelectItem[] {
  return options.map((option) => {
    const providerLabel = option.provider ? t(`Common.providers.${option.provider}`) : "";
    const label =
      option.label || (field === FilterFieldKey.emailFolder.toString() ? t("Common.unnamed") : providerLabel);
    return {
      key: option.value,
      value: option.value,
      textValue: option.groupLabel ? `${label} · ${option.groupLabel}` : label,
      ...(field === FilterFieldKey.emailFolder.toString() && option.groupKey
        ? { optionLabel: label, groupKey: option.groupKey, groupLabel: option.groupLabel || providerLabel }
        : {}),
      startContent: option.provider ? renderProviderIcon(option.provider, providerLabel) : undefined,
    };
  });
}

const RecordOptionIdSchema = z.uuid();

function validActivityFilters(filters: Filter[] | undefined): z.infer<typeof ActivityFilterSchema>[] {
  return (filters ?? []).flatMap((filter) => {
    const candidate =
      filter.operator === FilterOperatorKey.hasSome || filter.operator === FilterOperatorKey.hasNone
        ? { field: filter.field, operator: filter.operator }
        : filter;
    const parsed = ActivityFilterSchema.safeParse(candidate);
    return parsed.success ? [parsed.data] : [];
  });
}

const SELF_IDENTIFYING_FILTER_FIELDS = new Set<FilterFieldKey>([FilterFieldKey.workspaceId]);

const filterFieldKeyOf = (field: string): FilterFieldKey | undefined =>
  Object.values(FilterFieldKey).find((key) => key === (field as FilterFieldKey));

export function filterOptionSources(
  t: Translate,
  _activityQueryRef: ActivityQueryRef,
): Record<FilterFieldKey, FilterOptionSource> {
  return {
    [FilterFieldKey.ownerUserId]: {
      getItems: (params) =>
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
    },
    [FilterFieldKey.participantContactId]: {
      getItems: async (params) => {
        const result = await getIdentityRecordChoicesAction(params.searchTerm ?? "");
        return {
          items: result.records.map((record) => ({
            key: recordReferenceKey(record.ref),
            value: recordReferenceKey(record.ref),
            textValue: record.title,
            startContent: renderAvatar(record.title, record.avatarUrl),
          })),
        };
      },
    },
    [FilterFieldKey.draft]: NO_FILTER_OPTIONS,
    [FilterFieldKey.participants]: NO_FILTER_OPTIONS,
    [FilterFieldKey.timelineKind]: {
      items: () =>
        TIMELINE_KIND_VIEW_VALUES.map((type) => ({
          key: type,
          value: type,
          textValue: t(`EntityTimeline.types.${type}`),
        })),
    },
    [FilterFieldKey.timelineThreadId]: {
      getItems: async (params) => {
        const result = await getMessagingThreadsAction(params);
        return {
          items: result.items.map((thread) => ({
            key: thread.id,
            value: thread.id,
            textValue: thread.subject?.trim() || thread.name?.trim() || t("Common.inputs.unavailableSelection"),
            startContent: renderProviderIcon(thread.provider, t(`Common.providers.${thread.provider}`)),
          })),
        };
      },
    },
    [FilterFieldKey.updatedAt]: NO_FILTER_OPTIONS,
    [FilterFieldKey.createdAt]: NO_FILTER_OPTIONS,
    [FilterFieldKey.event]: {
      items: () =>
        Object.values(DomainEvent).map((event) => ({
          key: event,
          value: event,
          textValue: t(`Common.events.${event}`),
        })),
    },
    [FilterFieldKey.url]: NO_FILTER_OPTIONS,
    [FilterFieldKey.webhookId]: {
      getItems: async (params) => {
        const result = await getWebhooksAction(params);
        return {
          ...result,
          items: result.items.map((webhook) => ({
            key: webhook.id,
            value: webhook.id,
            textValue: webhook.description?.trim() ? `${webhook.url} · ${webhook.description.trim()}` : webhook.url,
          })),
        };
      },
    },
    [FilterFieldKey.name]: NO_FILTER_OPTIONS,
    [FilterFieldKey.firstName]: NO_FILTER_OPTIONS,
    [FilterFieldKey.lastName]: NO_FILTER_OPTIONS,
    [FilterFieldKey.status]: {
      items: () =>
        Object.values(Status).map((status) => ({
          key: status,
          value: status,
          textValue: t(`Common.userStatuses.${status}`),
          color: USER_STATUS_COLORS_MAP[status],
        })),
    },
    [FilterFieldKey.provider]: {
      items: () =>
        Object.values(MessagingProvider).map((provider) => ({
          key: provider,
          value: provider,
          textValue: t(`Common.providers.${provider}`),
          startContent: renderProviderIcon(provider, t(`Common.providers.${provider}`)),
        })),
    },
    [FilterFieldKey.state]: {
      items: () =>
        Object.values(MessagingThreadState).map((state) => ({
          key: state,
          value: state,
          textValue: t(`Inbox.threadStates.${state}`),
          color: THREAD_STATE_CHIP_COLOR[state],
          startContent: <ThreadStateDot className="size-1.5" state={state} />,
        })),
    },
    [FilterFieldKey.connectedAccountId]: {
      getItems: () =>
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
    },
    [FilterFieldKey.emailFolder]: {
      getItems: () =>
        getMessagingFilterOptionsAction().then((options) => ({
          items: scopedOptionItems(options.folders, FilterFieldKey.emailFolder, t),
        })),
    },
    [FilterFieldKey.lastMessageDirection]: {
      items: () =>
        ["inbound", "outbound"].map((direction) => ({
          key: direction,
          value: direction,
          textValue: t(`Inbox.lastMessageDirections.${direction}`),
        })),
    },
    [FilterFieldKey.lastMessageSentAt]: NO_FILTER_OPTIONS,
    [FilterFieldKey.lastMessageAt]: NO_FILTER_OPTIONS,
    [FilterFieldKey.calendarId]: {
      getItems: (params) =>
        getCalendarsAction(params).then((res) => ({
          items: res.items.map((calendar) => {
            const { provider } = calendar;
            return {
              key: calendar.id,
              value: calendar.id,
              textValue: calendar.name,
              startContent: renderProviderIcon(provider, t(`Common.providers.${provider}`)),
            };
          }),
        })),
    },
    [FilterFieldKey.startsAt]: NO_FILTER_OPTIONS,
    [FilterFieldKey.plan]: {
      items: () =>
        Object.values(SubscriptionPlan).map((plan) => ({
          key: plan,
          value: plan,
          textValue: t(`Subscription.planNames.${plan}`),
        })),
    },
    [FilterFieldKey.subscriptionStatus]: {
      items: () =>
        Object.values(SubscriptionStatus).map((status) => ({
          key: status,
          value: status,
          textValue: t(`Subscription.status.${status}`),
          color: SUBSCRIPTION_STATUS_COLOR_MAP[status],
        })),
    },
    [FilterFieldKey.isPlatformOperator]: {
      items: () => [
        {
          key: "true",
          value: "true",
          textValue: t("OperatorUsers.values.operator"),
        },
        {
          key: "false",
          value: "false",
          textValue: t("OperatorUsers.platformAccess.revoked"),
        },
      ],
    },
    [FilterFieldKey.lastActiveAt]: NO_FILTER_OPTIONS,
    [FilterFieldKey.workspaceId]: {
      getItems: (params) =>
        getOperatorWorkspacesAction(params).then((res) => ({
          items: res.items.map((workspace) => ({
            key: workspace.id,
            value: workspace.id,
            textValue: workspace.ownerEmail
              ? `${workspace.workspaceLabel} · ${workspace.ownerEmail}`
              : workspace.workspaceLabel,
          })),
        })),
    },
    [FilterFieldKey.adProvider]: {
      items: () =>
        AD_PROVIDER_ORDER.map((provider) => ({
          key: provider,
          value: provider,
          textValue: adProviderDisplayName(provider),
        })),
    },
    [FilterFieldKey.auditSource]: {
      items: () => [
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
      ],
    },
    [FilterFieldKey.workspaceTags]: {
      getItems: () =>
        getOperatorWorkspaceTagsAction().then((tags) => ({
          items: tags.map((tag) => ({ key: tag, value: tag, textValue: tag })),
        })),
    },
    [FilterFieldKey.trashKind]: {
      items: () => TRASH_KINDS.map((kind) => ({ key: kind, value: kind, textValue: t(`Trash.kinds.${kind}`) })),
    },
    [FilterFieldKey.trashList]: {
      getItems: () =>
        getRecordNavigationAction().then((navigation) => ({
          items: navigation.types.map((type) => {
            const Icon = recordTypeIcon(type.icon);
            return {
              key: type.id,
              value: type.id,
              textValue: type.pluralLabel,
              startContent: <Icon aria-hidden className="size-4 shrink-0" />,
            };
          }),
        })),
    },
  };
}

export function useFilterSelectItems(
  filter: Filter,
  customColumns?: ColumnPresentation[],
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
  const scopedOptions = useFilterOptions(field);
  const fieldKey = field as FilterFieldKey;
  const value = "value" in filter ? filter.value : undefined;
  const isCustom = isCustomField(field);
  const presentation = customColumns?.find((column) => column.id === field);
  const referenceTypeId = presentation?.type === "recordReference" ? presentation.typeId : undefined;
  const presentationType = presentation?.type;
  const timelineScopeKey = JSON.stringify(validActivityFilters(activityQuery?.filters));
  const scopeKey = fieldKey === FilterFieldKey.timelineThreadId ? timelineScopeKey : String(field);

  const source = useMemo<FilterOptionSource>(() => {
    if (referenceTypeId) {
      return {
        getItems: async (params) => {
          const result = await getRecordChoicesAction({
            typeId: referenceTypeId,
            search: params.searchTerm,
            page: params.page ?? params.pagination?.page ?? 1,
            pageSize: params.pageSize ?? params.pagination?.pageSize ?? 25,
          });
          if (!result.ok) throw new Error("Record choices unavailable");
          const data = result.data;
          return {
            items: data.records.map((record) => ({
              key: record.ref.recordId,
              value: record.ref.recordId,
              textValue: recordDisplayName(record.title, data.typeLabel, t),
            })),
            pagination: {
              page: data.page,
              pageSize: data.pageSize as 5 | 10 | 25 | 100,
              total: data.total,
              totalPages: Math.max(1, Math.ceil(data.total / data.pageSize)),
            },
          };
        },
      };
    }
    if (presentationType === "member") return filterOptionSources(t, activityQueryRef)[FilterFieldKey.ownerUserId];
    if (presentationType === "boolean") {
      return {
        items: () => [
          { key: "true", value: "true", textValue: t("RecordModel.yes") },
          { key: "false", value: "false", textValue: t("RecordModel.no") },
        ],
      };
    }
    if (isCustom) return NO_FILTER_OPTIONS;
    if (scopedOptions && field === FilterFieldKey.timelineKind.toString()) {
      return {
        items: () =>
          scopedOptions.map((option) => ({
            key: option.value,
            value: option.value,
            textValue: t(`EntityTimeline.types.${option.value}`),
          })),
      };
    }
    if (scopedOptions) return { items: () => scopedOptionItems(scopedOptions, field, t) };

    const enumValue = filterFieldKeyOf(field);
    return enumValue ? filterOptionSources(t, activityQueryRef)[enumValue] : NO_FILTER_OPTIONS;
  }, [field, isCustom, t, timelineScopeKey, referenceTypeId, presentationType, scopedOptions]);

  const getItems = source && "getItems" in source ? source.getItems : undefined;

  const getSelectedItems = useMemo<ResolveItemsFunction | undefined>(() => {
    if (referenceTypeId) {
      return async (ids) => {
        const unique = [...new Set(ids.filter((id) => RecordOptionIdSchema.safeParse(id).success))];
        if (unique.length > 100) throw new Error("Too many selected records");
        const items: FilterSelectItem[] = [];
        for (let offset = 0; offset < unique.length; offset += 50) {
          const result = await resolveSearchReferencesAction({
            refs: unique.slice(offset, offset + 50).map((recordId) => ({ typeId: referenceTypeId, recordId })),
          });
          if (!result.ok) throw new Error("Selected records unavailable");
          items.push(
            ...result.data.results.map((record) => ({
              key: record.ref.recordId,
              value: record.ref.recordId,
              textValue: recordDisplayName(record.title, record.typeLabel, t),
              startContent: renderAvatar(recordDisplayName(record.title, record.typeLabel, t), record.pictureUrl),
            })),
          );
        }
        return items;
      };
    }
    if (presentationType === "member") {
      return async (ids) => {
        const result = await resolveUserOptionsAction({
          ids: [...new Set(ids)],
        });
        return result.users.map((user) => ({
          key: user.id,
          value: user.id,
          textValue: `${user.firstName} ${user.lastName}`.trim(),
          startContent: renderAvatar(`${user.firstName} ${user.lastName}`.trim(), user.avatarUrl),
        }));
      };
    }
    if (fieldKey === FilterFieldKey.participantContactId) {
      return async (ids) => {
        const refs = ids.flatMap<RecordRef | string>((id) => {
          const ref = parseRecordReferenceKey(id);
          return ref ? [ref] : z.uuid().safeParse(id).success ? [id] : [];
        });
        const result = await getIdentityRecordChoicesAction("", refs);
        return result.records.map((record) => {
          const key = ids.includes(record.ref.recordId) ? record.ref.recordId : recordReferenceKey(record.ref);
          return {
            key,
            value: key,
            textValue: record.title,
            startContent: renderAvatar(record.title, record.avatarUrl),
          };
        });
      };
    }
    if (fieldKey === FilterFieldKey.timelineThreadId) {
      return async (ids) => {
        const selected = [...new Set(ids.filter((id) => RecordOptionIdSchema.safeParse(id).success))].slice(
          0,
          ACTIVITY_FILTER_VALUE_MAX,
        );
        const results = await Promise.all(selected.map((id) => getMessagingThreadAction(id)));
        return results.flatMap((result) =>
          result
            ? [
                {
                  key: result.thread.id,
                  value: result.thread.id,
                  textValue:
                    result.thread.subject?.trim() ||
                    result.thread.name?.trim() ||
                    t("Common.inputs.unavailableSelection"),
                  startContent: renderProviderIcon(
                    result.thread.provider,
                    t(`Common.providers.${result.thread.provider}`),
                  ),
                },
              ]
            : [],
        );
      };
    }
    if (!hasActivityQuery) return undefined;
    return undefined;
  }, [hasActivityQuery, field, referenceTypeId, presentationType, t]);

  const resolveItems = useMemo<ResolveItemsFunction | undefined>(() => {
    if (getSelectedItems) return getSelectedItems;

    if (!getItems) return undefined;

    const selfIdentifyingField = SELF_IDENTIFYING_FILTER_FIELDS.has(fieldKey) ? fieldKey : null;

    return async (ids) => {
      const requested = new Set(ids);
      const params: GetQueryParams = selfIdentifyingField
        ? {
            filters: [{ field: selfIdentifyingField, operator: FilterOperatorKey.in, value: [...ids] }],
          }
        : {};
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
    if (referenceTypeId || presentationType === "member") return fetchedItems;
    if (presentationType === "boolean" && source && "items" in source) return source.items();
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

    if (!source) return [];

    return "items" in source ? source.items() : fetchedItems;
  }, [field, isCustom, fetchedItems, customColumns, source, referenceTypeId, presentationType]);

  return {
    items,
    getItems,
    isLoading,
    maxSelectedValues: hasActivityQuery
      ? ACTIVITY_FILTER_VALUE_MAX
      : referenceTypeId || presentationType === "member"
        ? 100
        : undefined,
    selectionError,
    retrySelection,
    scopeKey,
  };
}
