"use client";

import type { FormEvent } from "react";
import type {
  OperatorUserDetailDto,
  OperatorUserListItemDto,
  OperatorUserPageDto,
  OperatorUserSummaryDto,
  ParsedListOperatorUsersData,
} from "@/ee/operator/operator.schema";
import type { LucideIcon } from "lucide-react";
import type { OperatorUsersActionState, OperatorUsersListResult } from "./actions";

import {
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Filter,
  RefreshCcw,
  Search,
  ShieldCheck,
  UserCheck,
  UsersRound,
  X,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { getOperatorUserDetailAction, listOperatorUsersAction } from "./actions";
import { OperatorUserDetailPanel } from "./operator-user-detail";
import {
  AccountStatusLabel,
  NativeSelect,
  OperatorUsersActionNotice,
  SubscriptionPlanLabel,
  SubscriptionStatusLabel,
} from "./operator-users-ui";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { useRouter } from "@/i18n/navigation";

type Props = {
  initialPage: OperatorUserPageDto;
  summary: OperatorUserSummaryDto;
};

type FilterDraft = {
  isPlatformOperator: string;
  query: string;
  sort: string;
  status: string;
  subscriptionPlan: string;
  subscriptionStatus: string;
};

const EMPTY_FILTERS: FilterDraft = {
  isPlatformOperator: "",
  query: "",
  sort: "newest",
  status: "",
  subscriptionPlan: "",
  subscriptionStatus: "",
};

const INITIAL_REQUEST: ParsedListOperatorUsersData = {
  limit: 25,
  sort: "newest",
};

function filtersAsFormData(filters: FilterDraft, cursor?: string): FormData {
  const formData = new FormData();
  if (cursor) formData.set("cursor", cursor);
  if (filters.query.trim()) formData.set("query", filters.query);
  if (filters.status) formData.set("status", filters.status);
  if (filters.subscriptionPlan) formData.set("subscriptionPlan", filters.subscriptionPlan);
  if (filters.subscriptionStatus) formData.set("subscriptionStatus", filters.subscriptionStatus);
  if (filters.isPlatformOperator) formData.set("isPlatformOperator", filters.isPlatformOperator);
  formData.set("sort", filters.sort);
  return formData;
}

function requestAsFormData(request: ParsedListOperatorUsersData, cursor?: string): FormData {
  return filtersAsFormData(
    {
      isPlatformOperator: request.isPlatformOperator === undefined ? "" : request.isPlatformOperator ? "true" : "false",
      query: request.query ?? "",
      sort: request.sort,
      status: request.status ?? "",
      subscriptionPlan: request.subscriptionPlan ?? "",
      subscriptionStatus: request.subscriptionStatus ?? "",
    },
    cursor,
  );
}

export function OperatorUsersConsole({ initialPage, summary }: Props) {
  const t = useTranslations();
  const format = useFormatter();
  const router = useRouter();
  const [draft, setDraft] = useState<FilterDraft>(EMPTY_FILTERS);
  const [page, setPage] = useState(initialPage);
  const [activeRequest, setActiveRequest] = useState<ParsedListOperatorUsersData>(INITIAL_REQUEST);
  const [currentCursor, setCurrentCursor] = useState<string | undefined>();
  const [cursorStack, setCursorStack] = useState<Array<string | undefined>>([]);
  const [listPending, setListPending] = useState(false);
  const listPendingRef = useRef(false);
  const [listState, setListState] = useState<OperatorUsersActionState<OperatorUsersListResult>>({ status: "idle" });
  const [detailPending, setDetailPending] = useState(false);
  const detailPendingRef = useRef(false);
  const [detailMutationPending, setDetailMutationPending] = useState(false);
  const detailMutationPendingRef = useRef(false);
  const [requestedUserId, setRequestedUserId] = useState<string>();
  const selectedUserIdRef = useRef<string>();
  const [detailState, setDetailState] = useState<OperatorUsersActionState<OperatorUserDetailDto>>({ status: "idle" });

  const integer = (value: number) => format.number(value, { maximumFractionDigits: 0 });
  const dateTime = (value: string | null) =>
    value
      ? format.dateTime(new Date(value), {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "UTC",
        })
      : t("OperatorUsers.values.never");

  async function requestPage(formData: FormData): Promise<OperatorUsersListResult | null> {
    if (listPendingRef.current) return null;
    listPendingRef.current = true;
    setListPending(true);
    setListState({ status: "idle" });

    try {
      const result = await listOperatorUsersAction(formData);
      setListState(result);
      if (result.status !== "success") return null;
      setPage(result.data.page);
      setActiveRequest(result.data.request);
      setCurrentCursor(result.data.request.cursor);
      return result.data;
    } catch {
      setListState({ status: "error", errorCode: "unexpected" });
      return null;
    } finally {
      listPendingRef.current = false;
      setListPending(false);
    }
  }

  function clearDetail() {
    if (detailPendingRef.current || detailMutationPendingRef.current) return;
    selectedUserIdRef.current = undefined;
    setRequestedUserId(undefined);
    setDetailState({ status: "idle" });
  }

  async function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (detailPendingRef.current || detailMutationPendingRef.current) return;
    clearDetail();
    const result = await requestPage(filtersAsFormData(draft));
    if (result) setCursorStack([]);
  }

  async function clearFilters() {
    if (detailPendingRef.current || detailMutationPendingRef.current) return;
    setDraft(EMPTY_FILTERS);
    clearDetail();
    const result = await requestPage(filtersAsFormData(EMPTY_FILTERS));
    if (result) setCursorStack([]);
  }

  async function nextPage() {
    if (detailPendingRef.current || detailMutationPendingRef.current || !page.nextCursor) return;
    const result = await requestPage(requestAsFormData(activeRequest, page.nextCursor));
    if (result) setCursorStack((current) => [...current, currentCursor]);
  }

  async function previousPage() {
    if (detailPendingRef.current || detailMutationPendingRef.current || cursorStack.length === 0) return;
    const previousCursor = cursorStack.at(-1);
    const result = await requestPage(requestAsFormData(activeRequest, previousCursor));
    if (result) setCursorStack((current) => current.slice(0, -1));
  }

  async function refreshCurrentPage() {
    await requestPage(requestAsFormData(activeRequest, currentCursor));
  }

  async function openUser(userId: string) {
    if (detailPendingRef.current || detailMutationPendingRef.current) return;
    detailPendingRef.current = true;
    selectedUserIdRef.current = userId;
    setDetailPending(true);
    setRequestedUserId(userId);
    setDetailState({ status: "idle" });

    try {
      const result = await getOperatorUserDetailAction(userId);
      setDetailState(
        result.status === "success" && result.data.userId !== userId
          ? { status: "error", errorCode: "unexpected" }
          : result,
      );
    } catch {
      setDetailState({ status: "error", errorCode: "unexpected" });
    } finally {
      detailPendingRef.current = false;
      setDetailPending(false);
    }
  }

  function handleUserUpdated(user: OperatorUserDetailDto) {
    if (selectedUserIdRef.current !== user.userId) return;
    setDetailState({ status: "success", data: user });
    router.refresh();
    void refreshCurrentPage().catch(reportApplicationError);
  }

  function handleDetailMutationPendingChange(pending: boolean) {
    detailMutationPendingRef.current = pending;
    setDetailMutationPending(pending);
  }

  const selectedUser = detailState.status === "success" ? detailState.data : null;
  const selectedUserId = selectedUser?.userId ?? requestedUserId;
  selectedUserIdRef.current = selectedUserId;
  const pageNumber = cursorStack.length + 1;
  const totalPages = Math.max(1, Math.ceil(page.total / 25));
  const rangeStart = page.users.length > 0 ? (pageNumber - 1) * 25 + 1 : 0;
  const rangeEnd = page.users.length > 0 ? rangeStart + page.users.length - 1 : 0;
  const directoryInteractionDisabled = listPending || detailPending || detailMutationPending;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <section aria-labelledby="operator-users-title" className="max-w-3xl space-y-2">
        <Badge variant="secondary">
          <UsersRound aria-hidden />

          {t("OperatorUsers.badge")}
        </Badge>

        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl" id="operator-users-title">
          {t("OperatorUsers.title")}
        </h1>

        <p className="text-sm leading-6 text-muted-foreground sm:text-base">{t("OperatorUsers.description")}</p>
      </section>

      <section aria-labelledby="operator-user-summary-heading" className="space-y-3">
        <h2 className="sr-only" id="operator-user-summary-heading">
          {t("OperatorUsers.summary.heading")}
        </h2>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <SummaryCard
            description={t("OperatorUsers.summary.totalDescription", {
              pending: integer(summary.byStatus.pendingAuthorization),
            })}
            icon={UsersRound}
            label={t("OperatorUsers.summary.total")}
            value={integer(summary.totalUsers)}
          />

          <SummaryCard
            description={t("OperatorUsers.summary.companiesDescription")}
            icon={Building2}
            label={t("OperatorUsers.summary.companies")}
            value={integer(summary.totalCompanies)}
          />

          <SummaryCard
            description={t("OperatorUsers.summary.activeDescription", {
              inactive: integer(summary.byStatus.inactive),
            })}
            icon={CheckCircle2}
            label={t("OperatorUsers.summary.active")}
            value={integer(summary.byStatus.active)}
          />

          <SummaryCard
            description={t("OperatorUsers.summary.subscriptionHealthDescription", {
              enterprise: integer(summary.byPlan.enterprise),
              missing: integer(summary.bySubscriptionStatus.missing),
              trial: integer(summary.bySubscriptionStatus.trial),
            })}
            icon={CreditCard}
            label={t("OperatorUsers.summary.subscriptionHealth")}
            value={integer(summary.bySubscriptionStatus.active)}
          />

          <SummaryCard
            description={t("OperatorUsers.summary.verifiedDescription", {
              unverified: integer(summary.totalUsers - summary.verifiedAuthUsers),
            })}
            icon={UserCheck}
            label={t("OperatorUsers.summary.verified")}
            value={integer(summary.verifiedAuthUsers)}
          />

          <SummaryCard
            description={t("OperatorUsers.summary.operatorsDescription")}
            icon={ShieldCheck}
            label={t("OperatorUsers.summary.operators")}
            value={integer(summary.platformOperators)}
          />
        </div>
      </section>

      <section className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.7fr)]">
        <Card className="min-w-0" data-testid="operator-users-table-card">
          <CardHeader>
            <CardTitle>{t("OperatorUsers.table.title")}</CardTitle>

            <CardDescription>{t("OperatorUsers.table.description")}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            <form
              aria-busy={directoryInteractionDisabled}
              className="space-y-4"
              method="post"
              onSubmit={(event) => runUserAction(() => applyFilters(event))}
            >
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-2 md:col-span-2 xl:col-span-3">
                  <Label htmlFor="operatorUserQuery">{t("OperatorUsers.filters.searchLabel")}</Label>

                  <div className="relative">
                    <Search
                      aria-hidden
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    />

                    <Input
                      aria-describedby="operatorUserQuery-description"
                      autoCapitalize="none"
                      autoComplete="off"
                      className="pl-9"
                      disabled={directoryInteractionDisabled}
                      id="operatorUserQuery"
                      maxLength={200}
                      name="query"
                      placeholder={t("OperatorUsers.filters.searchPlaceholder")}
                      spellCheck={false}
                      value={draft.query}
                      onChange={(event) => setDraft((current) => ({ ...current, query: event.target.value }))}
                    />
                  </div>

                  <p className="text-xs leading-5 text-muted-foreground" id="operatorUserQuery-description">
                    {t("OperatorUsers.filters.searchDescription")}
                  </p>
                </div>

                <FilterSelect
                  disabled={directoryInteractionDisabled}
                  id="operatorUserAccountStatusFilter"
                  label={t("OperatorUsers.filters.accountStatus")}
                  value={draft.status}
                  onChange={(status) => setDraft((current) => ({ ...current, status }))}
                >
                  <option value="">{t("OperatorUsers.filters.allStatuses")}</option>

                  <option value="active">{t("OperatorUsers.values.accountStatus.active")}</option>

                  <option value="inactive">{t("OperatorUsers.values.accountStatus.inactive")}</option>

                  <option value="pendingAuthorization">
                    {t("OperatorUsers.values.accountStatus.pendingAuthorization")}
                  </option>
                </FilterSelect>

                <FilterSelect
                  disabled={directoryInteractionDisabled}
                  id="operatorUserPlanFilter"
                  label={t("OperatorUsers.filters.plan")}
                  value={draft.subscriptionPlan}
                  onChange={(subscriptionPlan) => setDraft((current) => ({ ...current, subscriptionPlan }))}
                >
                  <option value="">{t("OperatorUsers.filters.allPlans")}</option>

                  <option value="starter">{t("OperatorConsole.values.plans.starter")}</option>

                  <option value="pro">{t("OperatorConsole.values.plans.pro")}</option>

                  <option value="business">{t("OperatorConsole.values.plans.business")}</option>

                  <option value="enterprise">{t("OperatorConsole.values.plans.enterprise")}</option>
                </FilterSelect>

                <FilterSelect
                  disabled={directoryInteractionDisabled}
                  id="operatorUserSubscriptionStatusFilter"
                  label={t("OperatorUsers.filters.subscriptionStatus")}
                  value={draft.subscriptionStatus}
                  onChange={(subscriptionStatus) => setDraft((current) => ({ ...current, subscriptionStatus }))}
                >
                  <option value="">{t("OperatorUsers.filters.allSubscriptionStatuses")}</option>

                  <option value="trial">{t("OperatorConsole.values.subscription.trial")}</option>

                  <option value="active">{t("OperatorConsole.values.subscription.active")}</option>

                  <option value="cancelled">{t("OperatorConsole.values.subscription.cancelled")}</option>

                  <option value="expired">{t("OperatorConsole.values.subscription.expired")}</option>

                  <option value="pastDue">{t("OperatorConsole.values.subscription.pastDue")}</option>

                  <option value="unPaid">{t("OperatorConsole.values.subscription.unPaid")}</option>
                </FilterSelect>

                <FilterSelect
                  disabled={directoryInteractionDisabled}
                  id="operatorUserOperatorFilter"
                  label={t("OperatorUsers.filters.operator")}
                  value={draft.isPlatformOperator}
                  onChange={(isPlatformOperator) => setDraft((current) => ({ ...current, isPlatformOperator }))}
                >
                  <option value="">{t("OperatorUsers.filters.allOperatorStates")}</option>

                  <option value="true">{t("OperatorUsers.values.yes")}</option>

                  <option value="false">{t("OperatorUsers.values.no")}</option>
                </FilterSelect>

                <FilterSelect
                  disabled={directoryInteractionDisabled}
                  id="operatorUserSort"
                  label={t("OperatorUsers.filters.sort")}
                  value={draft.sort}
                  onChange={(sort) => setDraft((current) => ({ ...current, sort }))}
                >
                  <option value="newest">{t("OperatorUsers.filters.sortNewest")}</option>

                  <option value="oldest">{t("OperatorUsers.filters.sortOldest")}</option>

                  <option value="emailAsc">{t("OperatorUsers.filters.sortEmailAsc")}</option>

                  <option value="emailDesc">{t("OperatorUsers.filters.sortEmailDesc")}</option>
                </FilterSelect>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button disabled={directoryInteractionDisabled} type="submit">
                  {listPending ? (
                    <Spinner aria-label={t("OperatorUsers.states.loading")} size="sm" />
                  ) : (
                    <Filter aria-hidden />
                  )}

                  {listPending ? t("OperatorUsers.states.loading") : t("OperatorUsers.filters.apply")}
                </Button>

                <Button
                  disabled={directoryInteractionDisabled}
                  type="button"
                  variant="secondary"
                  onClick={() => runUserAction(clearFilters)}
                >
                  <X aria-hidden />

                  {t("OperatorUsers.filters.clear")}
                </Button>
              </div>
            </form>

            <OperatorUsersActionNotice state={listState} />

            {page.users.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
                <Search aria-hidden className="mx-auto mb-3 size-6 text-muted-foreground" />

                <p className="text-sm font-medium">{t("OperatorUsers.table.emptyTitle")}</p>

                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {t("OperatorUsers.table.emptyDescription")}
                </p>
              </div>
            ) : (
              <Table>
                <TableCaption className="sr-only">{t("OperatorUsers.table.caption")}</TableCaption>

                <TableHeader>
                  <TableRow>
                    <TableHead>{t("OperatorUsers.table.columns.user")}</TableHead>

                    <TableHead>{t("OperatorUsers.table.columns.account")}</TableHead>

                    <TableHead>{t("OperatorUsers.table.columns.plan")}</TableHead>

                    <TableHead>{t("OperatorUsers.table.columns.subscription")}</TableHead>

                    <TableHead>{t("OperatorUsers.table.columns.operator")}</TableHead>

                    <TableHead>{t("OperatorUsers.table.columns.lastActive")}</TableHead>

                    <TableHead className="text-right">{t("OperatorUsers.table.columns.action")}</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {page.users.map((user) => (
                    <OperatorUserRow
                      key={user.userId}
                      dateTime={dateTime}
                      pending={detailPending || detailMutationPending}
                      selected={selectedUserId === user.userId}
                      user={user}
                      onOpen={openUser}
                    />
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>

          <CardFooter className="flex flex-col gap-3 border-t sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {t("OperatorUsers.pagination.range", {
                end: integer(rangeEnd),
                start: integer(rangeStart),
                total: integer(page.total),
              })}
            </p>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {t("OperatorUsers.pagination.page", { page: integer(pageNumber), total: integer(totalPages) })}
              </span>

              <Button
                aria-label={t("OperatorUsers.pagination.previous")}
                disabled={directoryInteractionDisabled || cursorStack.length === 0}
                size="icon-sm"
                variant="secondary"
                onClick={() => runUserAction(previousPage)}
              >
                <ChevronLeft aria-hidden />
              </Button>

              <Button
                aria-label={t("OperatorUsers.pagination.next")}
                disabled={directoryInteractionDisabled || !page.nextCursor}
                size="icon-sm"
                variant="secondary"
                onClick={() => runUserAction(nextPage)}
              >
                <ChevronRight aria-hidden />
              </Button>
            </div>
          </CardFooter>
        </Card>

        <aside aria-label={t("OperatorUsers.detail.panelLabel")} className="min-w-0 self-start xl:sticky xl:top-0">
          {detailPending ? (
            <Card aria-busy="true" role="status">
              <CardContent className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Spinner aria-label={t("OperatorUsers.states.loadingDetail")} />

                {t("OperatorUsers.states.loadingDetail")}
              </CardContent>
            </Card>
          ) : detailState.status === "error" ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("OperatorUsers.detail.errorTitle")}</CardTitle>

                <CardDescription>{t("OperatorUsers.detail.errorDescription")}</CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                <OperatorUsersActionNotice state={detailState} />

                {requestedUserId ? (
                  <Button variant="secondary" onClick={() => runUserAction(() => openUser(requestedUserId))}>
                    <RefreshCcw aria-hidden />

                    {t("OperatorUsers.actions.retry")}
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ) : selectedUser ? (
            <OperatorUserDetailPanel
              key={selectedUser.userId}
              user={selectedUser}
              onClose={clearDetail}
              onMutationPendingChange={handleDetailMutationPendingChange}
              onUpdated={handleUserUpdated}
            />
          ) : (
            <Card className="border-dashed">
              <CardContent className="flex min-h-48 flex-col items-center justify-center px-6 text-center">
                <UsersRound aria-hidden className="mb-3 size-6 text-muted-foreground" />

                <p className="text-sm font-medium">{t("OperatorUsers.detail.emptyTitle")}</p>

                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {t("OperatorUsers.detail.emptyDescription")}
                </p>
              </CardContent>
            </Card>
          )}
        </aside>
      </section>
    </div>
  );
}

function SummaryCard({
  description,
  icon: SummaryIcon,
  label,
  value,
}: {
  description: string;
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <Card className="gap-4 py-5">
      <CardHeader className="grid grid-cols-[1fr_auto] px-5">
        <CardDescription>{label}</CardDescription>

        <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <SummaryIcon aria-hidden className="size-4" />
        </span>
      </CardHeader>

      <CardContent className="space-y-1 px-5">
        <p className="text-2xl font-semibold tabular-nums">{value}</p>

        <p className="text-xs leading-5 text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function FilterSelect({
  children,
  disabled,
  id,
  label,
  value,
  onChange,
}: {
  children: React.ReactNode;
  disabled: boolean;
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>

      <NativeSelect disabled={disabled} id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </NativeSelect>
    </div>
  );
}

function OperatorUserRow({
  dateTime,
  pending,
  selected,
  user,
  onOpen,
}: {
  dateTime: (value: string | null) => string;
  pending: boolean;
  selected: boolean;
  user: OperatorUserListItemDto;
  onOpen: (userId: string) => Promise<void>;
}) {
  const t = useTranslations();

  return (
    <TableRow data-state={selected ? "selected" : undefined}>
      <TableCell className="max-w-64 whitespace-normal">
        <p className="truncate font-medium">{user.displayName || user.email}</p>

        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
      </TableCell>

      <TableCell>
        <div className="flex flex-col items-start gap-1">
          <Badge
            variant={user.status === "active" ? "success" : user.status === "inactive" ? "destructive" : "warning"}
          >
            <AccountStatusLabel status={user.status} />
          </Badge>

          <span className="text-[11px] text-muted-foreground">
            {user.authEmailVerified ? t("OperatorUsers.values.verified") : t("OperatorUsers.values.notVerified")}
          </span>
        </div>
      </TableCell>

      <TableCell>
        {user.subscription ? (
          <span className="inline-flex items-center gap-1.5">
            <SubscriptionPlanLabel plan={user.subscription.plan} />

            {user.subscription.billingProviderManaged ? (
              <RefreshCcw aria-label={t("OperatorUsers.values.providerManaged")} className="size-3.5 text-warning" />
            ) : null}
          </span>
        ) : (
          t("OperatorUsers.values.noSubscription")
        )}
      </TableCell>

      <TableCell>
        {user.subscription ? (
          <SubscriptionStatusLabel status={user.subscription.status} />
        ) : (
          t("OperatorUsers.values.noSubscription")
        )}
      </TableCell>

      <TableCell>
        {user.isPlatformOperator ? (
          <Badge variant="info">
            <ShieldCheck aria-hidden />

            {t("OperatorUsers.values.yes")}
          </Badge>
        ) : (
          t("OperatorUsers.values.no")
        )}
      </TableCell>

      <TableCell className="text-muted-foreground">{dateTime(user.lastActiveAt)}</TableCell>

      <TableCell className="text-right">
        <Button
          aria-label={t("OperatorUsers.table.openUser", { email: user.email })}
          aria-pressed={selected}
          disabled={pending}
          size="sm"
          variant="ghost"
          onClick={() => runUserAction(() => onOpen(user.userId))}
        >
          {selected && pending ? (
            <Spinner aria-label={t("OperatorUsers.states.loadingDetail")} size="sm" />
          ) : (
            <ChevronRight aria-hidden />
          )}

          {t("OperatorUsers.table.open")}
        </Button>
      </TableCell>
    </TableRow>
  );
}
