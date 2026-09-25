"use client";

import type { AgentContextAttachment } from "@/ee/agent-chat/agent-context";
import type { GlobalSearchResultItem } from "@/features/search/global-search.interactor";

import { Check, LayoutPanelTop, Loader2, Plus } from "lucide-react";
import { observer } from "mobx-react-lite";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { globalSearchAction } from "@/app/[locale]/(protected)/search/actions";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { ENTITY_ICON } from "@/components/entity-detail/entity-relations";
import { entitySearchResultLabel } from "@/components/entity-detail/entity-search-result-label";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { OVERLAY_TOPMOST_LAYER_CLASS } from "@/components/ui/overlay-contract";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { cn } from "@/core/utils/cn";
import { useDebouncedValue } from "@/core/utils/use-debounced-value";
import { AGENT_CONTEXT_ATTACHMENT_LIMIT, agentContextAttachmentKey } from "@/ee/agent-chat/agent-context";

import type { AgentContextCandidate } from "./agent-context-registry";

import { ActionTooltip, focusAgentComposer } from "./chat-ui";
import { useAgentChatStore, useAgentChatUiTargets } from "./agent-chat-store-context";
import { dedupeRecordSearchResults } from "./agent-context-picker-results";

type SearchState = {
  query: string;
  status: "success" | "error";
  results: GlobalSearchResultItem[];
};

function recordAttachment(item: GlobalSearchResultItem, label: string): AgentContextAttachment {
  return {
    reference: {
      kind: "record",
      entityType: item.type,
      recordId: item.id,
    },
    label,
  };
}

function CandidateIcon({ context }: { context: AgentContextAttachment }) {
  if (context.reference.kind === "dataView") return <LayoutPanelTop aria-hidden className="size-4" />;
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
  const uiTargets = useAgentChatUiTargets();
  const pathname = usePathname();
  const t = useTranslations();
  const { singular } = useEntityTerminology();
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
  const matchingSearch = trimmedQuery === debouncedQuery && searchState?.query === debouncedQuery ? searchState : null;
  const searchPending =
    open && trimmedQuery.length >= 1 && (trimmedQuery !== debouncedQuery || matchingSearch === null);
  const remoteResults = matchingSearch?.results ?? [];

  useEffect(() => {
    if (!open || debouncedQuery.length < 1 || trimmedQuery !== debouncedQuery) return;
    let active = true;

    void globalSearchAction({ searchTerm: debouncedQuery, limitPerEntity: 8 })
      .then((result) => {
        if (!active) return;
        setSearchState({
          query: debouncedQuery,
          status: result.ok ? "success" : "error",
          results: result.ok ? result.data.results : [],
        });
      })
      .catch((error: unknown) => {
        reportApplicationError(error);
        if (active) {
          setSearchState({
            query: debouncedQuery,
            status: "error",
            results: [],
          });
        }
      });

    return () => {
      active = false;
    };
  }, [debouncedQuery, open, trimmedQuery]);

  const close = () => {
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
    (item): AgentContextCandidate & { displayLabel: string; item: GlobalSearchResultItem } => {
      const displayLabel = entitySearchResultLabel(item, t);
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
                      typeLabel={singular(candidate.item.type)}
                      onSelect={() => choose(candidate)}
                    />
                  );
                })}
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
