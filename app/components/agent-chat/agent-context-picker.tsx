"use client";

import type { AgentContextAttachment } from "@/ee/agent-chat/agent-context";
import {
  recordSearchLabel,
  type RecordSearchHit,
  type RecordSearchResult,
} from "@/features/records/record-search.schema";

import { Check, LayoutPanelTop, Loader2, Plus, List, Settings2, ChartColumn } from "lucide-react";
import { observer } from "mobx-react-lite";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { globalSearchAction } from "@/app/[locale]/(protected)/search/actions";
import { ENTITY_ICON } from "@/components/entity-detail/entity-relations";
import { assistantSurfaceProps } from "@/components/modal/assistant-surface";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { OVERLAY_TOPMOST_LAYER_CLASS } from "@/components/ui/overlay-contract";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useRootStore } from "@/core/stores/root-store.provider";
import { recordSearchKey } from "@/features/records/record-search.schema";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { cn } from "@/core/utils/cn";
import { useDebouncedValue } from "@/core/utils/use-debounced-value";
import { AGENT_CONTEXT_ATTACHMENT_LIMIT, agentContextAttachmentKey } from "@/ee/agent-chat/agent-context";

import type { AgentContextCandidate } from "./agent-context-registry";

import { ActionTooltip, focusAgentComposer } from "./chat-ui";
import { useAgentChatStore, useAgentChatUiTargets } from "./agent-chat-store-context";
import { dedupeRecordSearchResults } from "./agent-context-picker-results";

type SearchState = {
  query: string;
  scope: string | null;
  status: "success" | "error";
  results: RecordSearchHit[];
  nextCursor: RecordSearchResult["nextCursor"];
};

function recordAttachment(item: RecordSearchHit, label: string): AgentContextAttachment {
  return {
    reference: {
      kind: "record",
      typeId: item.ref.typeId,
      recordId: item.ref.recordId,
    },
    label,
  };
}

function CandidateIcon({ context }: { context: AgentContextAttachment }) {
  if (context.reference.kind === "dataView") return <LayoutPanelTop aria-hidden className="size-4" />;
  if (context.reference.kind === "widget") return <ChartColumn aria-hidden className="size-4" />;
  if (context.reference.kind !== "record") return <Settings2 aria-hidden className="size-4" />;
  if ("typeId" in context.reference) return <List aria-hidden className="size-4" />;
  const Icon = ENTITY_ICON[context.reference.entityType];
  return <Icon aria-hidden className="size-4" />;
}

export const AgentContextPicker = observer(function AgentContextPicker({
  open,
  onOpenChange,
  restoreComposerFocusOnEscape,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restoreComposerFocusOnEscape: boolean;
}) {
  const store = useAgentChatStore();
  const user = useRootStore().userStore.user;
  const scope = user ? `${user.companyId}:${user.id}` : null;
  const request = useRef(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const uiTargets = useAgentChatUiTargets();
  const pathname = usePathname();
  const t = useTranslations();
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState<SearchState | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const restoreComposerFocusRef = useRef(false);
  const trimmedQuery = query.trim();
  const debouncedQuery = useDebouncedValue(trimmedQuery);
  const onPageCandidates: AgentContextCandidate[] = store.contextRegistry.candidates(pathname);
  const normalizedQuery = trimmedQuery.toLocaleLowerCase();
  const visiblePageCandidates = normalizedQuery
    ? onPageCandidates.filter((candidate: AgentContextCandidate) =>
        candidate.context.label.toLocaleLowerCase().includes(normalizedQuery),
      )
    : onPageCandidates;
  const selectedKeys = new Set(store.composerContexts.map(agentContextAttachmentKey));
  const matchingSearch =
    trimmedQuery === debouncedQuery && searchState?.query === debouncedQuery && searchState.scope === scope
      ? searchState
      : null;
  const searchPending =
    open && trimmedQuery.length >= 1 && (trimmedQuery !== debouncedQuery || matchingSearch === null);
  const remoteResults = matchingSearch?.results ?? [];

  useEffect(() => {
    if (!open || debouncedQuery.length < 1 || trimmedQuery !== debouncedQuery) return;
    let active = true;
    const generation = ++request.current;

    void globalSearchAction({ searchTerm: debouncedQuery, limit: 40, cursor: null })
      .then((result) => {
        if (!active) return;
        setSearchState({
          query: debouncedQuery,
          scope,
          status: result.ok ? "success" : "error",
          results: result.ok ? result.data.results : [],
          nextCursor: result.ok ? result.data.nextCursor : null,
        });
      })
      .catch((error: unknown) => {
        reportApplicationError(error);
        if (active) {
          setSearchState({
            query: debouncedQuery,
            scope,
            status: "error",
            results: [],
            nextCursor: null,
          });
        }
      });

    return () => {
      active = false;
      if (request.current === generation) request.current += 1;
    };
  }, [debouncedQuery, open, trimmedQuery, scope]);

  const loadMore = async () => {
    if (loadingMore || !matchingSearch?.nextCursor) return;
    const generation = request.current;
    setLoadingMore(true);
    try {
      const result = await globalSearchAction({
        searchTerm: debouncedQuery,
        limit: 40,
        cursor: matchingSearch.nextCursor,
      });
      if (generation !== request.current) return;
      if (!result.ok) {
        setSearchState({ ...matchingSearch, status: "error" });
        return;
      }
      const seen = new Set(matchingSearch.results.map(recordSearchKey));
      setSearchState({
        ...matchingSearch,
        status: "success",
        nextCursor: result.data.nextCursor,
        results: [...matchingSearch.results, ...result.data.results.filter((item) => !seen.has(recordSearchKey(item)))],
      });
    } catch (error) {
      reportApplicationError(error);
      if (generation === request.current) setSearchState({ ...matchingSearch, status: "error" });
    } finally {
      setLoadingMore(false);
    }
  };

  const close = () => {
    request.current += 1;
    onOpenChange(false);
    setQuery("");
    setSearchState(null);
  };

  const choose = (candidate: AgentContextCandidate) => {
    store.addComposerContext(candidate.context, candidate.pageRoute, candidate.starter, {
      replaceOldestAtLimit: candidate.context.reference.kind === "dataView",
    });
    restoreComposerFocusRef.current = true;
    close();
  };

  const recordCandidates = dedupeRecordSearchResults(remoteResults, visiblePageCandidates).map(
    (item): AgentContextCandidate & { displayLabel: string; item: RecordSearchHit } => {
      const displayLabel = recordSearchLabel(item, t);
      return {
        context: recordAttachment(item, displayLabel),
        displayLabel,
        item,
      };
    },
  );
  const hasQuery = trimmedQuery.length > 0;
  const hasVisibleItems = visiblePageCandidates.length > 0 || recordCandidates.length > 0;
  const searchFailed = Boolean(debouncedQuery && matchingSearch?.status === "error");
  const atLimit = store.composerContexts.length >= AGENT_CONTEXT_ATTACHMENT_LIMIT;
  const candidateDisabled = (candidate: AgentContextCandidate, selected: boolean) =>
    selected || (atLimit && candidate.context.reference.kind !== "dataView");

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          restoreComposerFocusRef.current = false;
          onOpenChange(true);
        } else close();
      }}
    >
      <ActionTooltip label={t("AgentChat.context.addTooltip")}>
        <PopoverTrigger asChild>
          <Button
            aria-keyshortcuts="/"
            aria-label={t("AgentChat.context.addAria")}
            className="shrink-0"
            data-testid="agent-context-picker-trigger"
            size="icon-sm"
            variant="ghost"
          >
            <Plus aria-hidden className="size-4" />
          </Button>
        </PopoverTrigger>
      </ActionTooltip>

      <PopoverContent
        {...assistantSurfaceProps()}
        align="start"
        className={cn("w-80 overflow-hidden p-0", OVERLAY_TOPMOST_LAYER_CLASS)}
        side="top"
        onCloseAutoFocus={(event) => {
          if (!restoreComposerFocusRef.current) return;

          event.preventDefault();
          restoreComposerFocusRef.current = false;
          focusAgentComposer(uiTargets);
        }}
        onEscapeKeyDown={() => {
          restoreComposerFocusRef.current = restoreComposerFocusOnEscape;
        }}
        onOpenAutoFocus={() => inputRef.current?.focus()}
      >
        <Command shouldFilter={false}>
          <CommandInput
            ref={inputRef}
            maxLength={200}
            placeholder={t("AgentChat.context.searchPlaceholder")}
            value={query}
            onValueChange={setQuery}
          />

          {searchPending && (
            <div
              aria-live="polite"
              className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground"
              role="status"
            >
              <Loader2 aria-hidden className="size-3.5 animate-spin" />

              <span>{t("GlobalSearch.loading")}</span>
            </div>
          )}

          <CommandList>
            {visiblePageCandidates.length > 0 && (
              <CommandGroup heading={t("AgentChat.context.onThisPage")}>
                {visiblePageCandidates.map((candidate: AgentContextCandidate) => {
                  const key = agentContextAttachmentKey(candidate.context);
                  const selected = selectedKeys.has(key);
                  return (
                    <ContextRow
                      key={key}
                      candidate={candidate}
                      disabled={candidateDisabled(candidate, selected)}
                      selected={selected}
                      onSelect={() => choose(candidate)}
                    />
                  );
                })}
              </CommandGroup>
            )}

            {hasQuery && recordCandidates.length > 0 && (
              <CommandGroup heading={t("AgentChat.context.records")}>
                {recordCandidates.map((candidate) => {
                  const key = agentContextAttachmentKey(candidate.context);
                  const selected = selectedKeys.has(key);
                  return (
                    <ContextRow
                      key={key}
                      candidate={candidate}
                      disabled={candidateDisabled(candidate, selected)}
                      displayLabel={candidate.displayLabel}
                      selected={selected}
                      typeLabel={candidate.item.typeLabel}
                      onSelect={() => choose(candidate)}
                    />
                  );
                })}
              </CommandGroup>
            )}

            {matchingSearch?.nextCursor && !searchPending && (
              <CommandGroup>
                <CommandItem
                  disabled={loadingMore}
                  value="context-search-more"
                  onSelect={() => runUserAction(() => loadMore())}
                >
                  {loadingMore ? t("GlobalSearch.loading") : t("GlobalSearch.loadMore")}
                </CommandItem>
              </CommandGroup>
            )}

            {searchFailed && !searchPending && (
              <div className="px-4 py-3 text-center text-sm text-muted-foreground" role="status">
                {t("AgentChat.context.searchError")}
              </div>
            )}

            {hasQuery && !searchFailed && !searchPending && !hasVisibleItems && (
              <CommandEmpty>{t("AgentChat.context.noResults")}</CommandEmpty>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
});

function ContextRow({
  candidate,
  disabled,
  displayLabel,
  selected,
  typeLabel,
  onSelect,
}: {
  candidate: AgentContextCandidate;
  disabled: boolean;
  displayLabel?: string;
  selected: boolean;
  typeLabel?: string;
  onSelect: () => void;
}) {
  return (
    <CommandItem
      className="gap-2.5"
      disabled={disabled}
      value={agentContextAttachmentKey(candidate.context)}
      onSelect={onSelect}
    >
      <CandidateIcon context={candidate.context} />

      <span className="min-w-0 flex-1 truncate">{displayLabel ?? candidate.context.label}</span>

      {typeLabel && <span className="shrink-0 text-[11px] text-muted-foreground">{typeLabel}</span>}

      {selected && <Check aria-hidden className="size-3.5 text-primary" />}
    </CommandItem>
  );
}
