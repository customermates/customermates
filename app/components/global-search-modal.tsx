"use client";

import type { RecordSearchHit } from "@/features/records/record-search.schema";
import type { CommandActionId, CommandEnvironment } from "@/components/keyboard/command-registry";
import type { ListGroup } from "./command-palette/command-palette-search";
import type { PaletteEntry, PaletteRecordContext, PaletteTranslator } from "./command-palette/palette-entries";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { BookOpen, ChevronLeft, CornerDownLeft, Loader2, Search, Sparkles, WandSparkles } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { recordSearchKey, recordSearchLabel } from "@/features/records/record-search.schema";
import { recordTypeIcon } from "@/components/records/record-type-icon";
import { Kbd, ShortcutKeys } from "@/components/keyboard/shortcut-keys";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useRootStore } from "@/core/stores/root-store.provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { initialsFor } from "@/core/utils/initials";
import { cn } from "@/core/utils/cn";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRecordEditorDeletion } from "@/app/[locale]/(protected)/records/[typeId]/components/use-record-deletion";
import {
  bestCandidate,
  exactTitleMatch,
  fuseCandidates,
  listGroups,
  parsePaletteQuery,
  rankCandidates,
  semanticBestCandidate,
  stableOrder,
  viewsOf,
} from "./command-palette/command-palette-search";
import {
  SEMANTIC_BEST_MATCH_MARGIN,
  SEMANTIC_BEST_MATCH_MIN_SIMILARITY,
} from "@/features/command-palette/command-search.schema";
import { encodeGetParams } from "@/core/utils/get-params";
import { recordEntries, staticEntries, workspaceEntries } from "./command-palette/palette-entries";
import { RecordCommandLevel } from "./command-palette/record-command-level";
import { useAccountActions } from "./navigation/use-account-actions";

const SECTION_LIMIT = 8;

type PaletteRowData = {
  key: string;
  label: string;
  icon?: LucideIcon;
  subtitle?: string;
  entry?: PaletteEntry;
  hit?: RecordSearchHit;
  indent?: boolean;
  onSelect: () => void;
};

type PaletteSection = { key: string; heading?: string; rows: PaletteRowData[] };

type OrderSnapshot = { term: string; sections: string[]; rows: Map<string, string[]> };

function applyStableOrder(sections: PaletteSection[], previous: OrderSnapshot): PaletteSection[] {
  const byKey = new Map(sections.map((section) => [section.key, section]));
  return stableOrder(
    previous.sections,
    sections.map((section) => section.key),
  ).flatMap((key) => {
    const section = byKey.get(key);
    if (!section) return [];
    const rows = new Map(section.rows.map((row) => [row.key, row]));
    const order = stableOrder(
      previous.rows.get(key) ?? [],
      section.rows.map((row) => row.key),
    );
    return [{ ...section, rows: order.flatMap((rowKey) => rows.get(rowKey) ?? []) }];
  });
}

export const GlobalSearchModal = observer(() => {
  const t = useTranslations();
  const translate: PaletteTranslator = (key, values) => t(key, values);
  const rootStore = useRootStore();
  const {
    addPickerStore,
    agentChatEnabled,
    agentChatStore,
    globalSearchModalStore,
    keyboardShortcutsStore,
    navigationGuard,
    recordWorkspaceStore,
    userStore,
    viewPickerStore,
  } = rootStore;
  const router = useRouter();
  const pathname = usePathname();
  const { changeTheme, signOut, inviteMembers, sendFeedback } = useAccountActions();
  const { isOpen, debouncedSearchTerm, isLoading, results, recentItems, level } = globalSearchModalStore;
  const activeEditor = recordWorkspaceStore.activeEditor;
  const deletion = useRecordEditorDeletion(activeEditor);
  const editor = isOpen ? activeEditor : null;
  const [selectedValue, setSelectedValue] = useState("");
  const navigated = useRef(false);
  const snapshot = useRef<OrderSnapshot>({ term: "", sections: [], rows: new Map() });

  useEffect(() => globalSearchModalStore.setWithUnsavedChangesGuard(false), []);

  const searchTerm = globalSearchModalStore.form.searchTerm ?? "";
  const { scope, term } = parsePaletteQuery(searchTerm);
  const query = scope ? term : searchTerm.trim();
  const hasQuery = term.length > 0;
  const mateAvailable = agentChatEnabled && agentChatStore.enabled === true;
  const navigation = recordWorkspaceStore.navigation;
  const currentListId = pathname.startsWith("/records/") ? pathname.split("/")[2] : undefined;

  const environment: CommandEnvironment = {
    appMode: rootStore.appMode,
    canManageSchema: navigation?.canManageSchema ?? false,
    onListPage: viewPickerStore.surface !== null,
    can: (resource, action) => userStore.can(resource, action),
  };
  const recordContext: PaletteRecordContext | null =
    editor?.record && !editor.isReadOnly && !editor.isBusy && !editor.hasUnsavedChanges
      ? {
          typeId: editor.presentation.typeId,
          title: editor.titleText,
          fields: editor.fields,
          relationships: editor.presentation.model.relationships,
          typeLabels: new Map((navigation?.types ?? []).map((type) => [type.id, type.label])),
          canDelete: editor.presentation.permittedActions.includes("delete"),
          canAssign:
            !editor.record.protectedKind &&
            !editor.presentation.model.types.find((type) => type.id === editor.presentation.typeId)?.embedded,
        }
      : null;
  const contextEntries = recordEntries(translate, recordContext);
  const entries = [
    ...staticEntries(translate, environment),
    ...workspaceEntries(translate, navigation, globalSearchModalStore.catalog),
    ...contextEntries,
  ];
  const entryByKey = new Map(entries.map((entry) => [entry.key, entry]));

  const closeThen = (action: (focusReturnTarget: HTMLElement | null) => void) => {
    const focusReturnTarget = globalSearchModalStore.focusReturnTarget;
    globalSearchModalStore.close();
    action(focusReturnTarget);
  };

  const askMate = () =>
    closeThen(() => {
      if (!query) {
        agentChatStore.open();
        return;
      }
      agentChatStore.openWithDraft(query);
      agentChatStore.submitDraft();
    });

  const actions: Record<CommandActionId, (target: HTMLElement | null) => void> = {
    add: (target) => addPickerStore.openFrom(target ?? document.body),
    switchView: (target) => viewPickerStore.openFrom(target ?? document.body),
    shortcuts: (target) => keyboardShortcutsStore.openFrom(target ?? document.body),
    themeLight: () => changeTheme("light"),
    themeDark: () => changeTheme("dark"),
    themeSystem: () => changeTheme("system"),
    inviteMembers,
    sendFeedback: (target) => sendFeedback(target ?? document.body),
    signOut,
  };

  const runEntry = (entry: PaletteEntry) => {
    const run = entry.run;
    if (run.kind === "level") {
      globalSearchModalStore.pushLevel(run.level);
      return;
    }
    if (!entry.key.startsWith("record:")) globalSearchModalStore.pushRecentCommand(entry.key);
    if (run.kind === "deleteRecord") {
      const record = editor?.record;
      closeThen(() => {
        if (editor && record) {
          runUserAction(() =>
            deletion.requestDeletion(
              record,
              editor.presentation.model.revision,
              editor.titleText ?? t("RecordModel.record"),
            ),
          );
        }
      });
      return;
    }
    if (run.kind === "href") {
      const href = run.href;
      closeThen(() => navigationGuard.tryNavigate(() => router.push(href)));
      return;
    }
    if (run.kind === "create") {
      const typeId = run.typeId;
      const fallback = globalSearchModalStore.focusReturnFallback;
      closeThen((target) => recordWorkspaceStore.open({ typeId }, target, fallback));
      return;
    }
    const action = actions[run.action];
    closeThen((target) => action(target));
  };

  const openItem = (item: RecordSearchHit) => {
    const focusReturnTarget = globalSearchModalStore.focusReturnTarget;
    const focusReturnFallback = globalSearchModalStore.focusReturnFallback;
    globalSearchModalStore.pushRecentItem(item);
    globalSearchModalStore.close();
    recordWorkspaceStore.open(item.ref, focusReturnTarget, focusReturnFallback);
  };

  const openRecentItem = (item: RecordSearchHit) => {
    runUserAction(() =>
      globalSearchModalStore.verifyRecentItem(item).then((exists) => {
        if (exists) openItem(item);
      }),
    );
  };

  const entryRow = (entry: PaletteEntry, indent = false): PaletteRowData => ({
    key: entry.key,
    label: entry.label,
    icon: entry.icon,
    subtitle: indent ? undefined : entry.subtitle,
    entry,
    indent,
    onSelect: () => runEntry(entry),
  });
  const hitRow = (hit: RecordSearchHit, recent: boolean): PaletteRowData => ({
    key: recordSearchKey(hit),
    label: recordSearchLabel(hit, t),
    hit,
    onSelect: () => (recent ? openRecentItem(hit) : openItem(hit)),
  });
  const listRows = (group: ListGroup<PaletteEntry>) => [
    entryRow(group.list),
    ...group.views.map((view) => entryRow(view, true)),
  ];

  const hits = scope === null || scope === "records" ? (results?.results ?? []) : [];
  const instant = hasQuery || scope ? rankCandidates(term, entries, scope) : [];
  const ranked = hasQuery ? fuseCandidates(instant, globalSearchModalStore.semantic, entries, scope) : instant;
  const bestEntry =
    bestCandidate(term, instant) ??
    (hasQuery
      ? semanticBestCandidate(globalSearchModalStore.semantic, entries, scope, {
          minSimilarity: SEMANTIC_BEST_MATCH_MIN_SIMILARITY,
          margin: SEMANTIC_BEST_MATCH_MARGIN,
        })
      : null);
  const bestHit = !bestEntry && hits[0] && exactTitleMatch(term, recordSearchLabel(hits[0], t)) ? hits[0] : undefined;
  const bestKey = bestEntry?.key ?? (bestHit ? recordSearchKey(bestHit) : undefined);
  useEffect(() => {
    globalSearchModalStore.setInstantMatcher((raw) => {
      const parsed = parsePaletteQuery(raw);
      return bestCandidate(parsed.term, rankCandidates(parsed.term, entries, parsed.scope)) !== null;
    });
  });
  const rankedOf = (kinds: readonly string[]) =>
    ranked.filter((entry) => kinds.includes(entry.kind) && entry.key !== bestKey).slice(0, SECTION_LIMIT);

  const suggestions = [
    ...contextEntries,
    ...(currentListId && !recordContext ? [`create:${currentListId}`, "cmd:action.switchView"] : []).flatMap(
      (key) => entryByKey.get(key) ?? [],
    ),
    ...(recordContext ? [] : [entryByKey.get("cmd:action.add")].filter((entry) => entry !== undefined)),
  ];

  const docsRows: PaletteRowData[] = globalSearchModalStore.docs
    .slice(0, scope === "docs" ? undefined : 3)
    .map((hit) => ({
      key: hit.key,
      label: hit.title,
      subtitle: hit.section ?? undefined,
      icon: BookOpen,
      onSelect: () => closeThen(() => navigationGuard.tryNavigate(() => router.push(hit.href))),
    }));
  const recordsPending = hasQuery && (isLoading || debouncedSearchTerm !== term);
  const resolvable =
    mateAvailable && !level && scope === null && !recordsPending && term.split(/\s+/).length >= 2 && !bestKey;
  const resolveQuery = () =>
    runUserAction(async () => {
      const outcome = await globalSearchModalStore.resolveCommand(term);
      if (outcome.status === "stale" || outcome.status === "unavailable") return;
      if (outcome.status === "none") {
        askMate();
        return;
      }
      const resolution = outcome.resolution;
      if (resolution.kind === "list") {
        const params = encodeGetParams({ viewId: resolution.viewId ?? undefined, filters: resolution.filters });
        const href = `/records/${resolution.typeId}${params.size ? `?${params.toString()}` : ""}`;
        closeThen(() => navigationGuard.tryNavigate(() => router.push(href)));
        return;
      }
      const entry = entryByKey.get(resolution.key);
      if (entry) runEntry(entry);
      else askMate();
    });

  const sections: PaletteSection[] = level
    ? []
    : hasQuery || scope
      ? [
          {
            key: "best",
            heading: t("CommandPalette.groups.bestMatch"),
            rows: bestEntry
              ? [
                  entryRow(bestEntry),
                  ...(bestEntry.kind === "list"
                    ? viewsOf(bestEntry.key, entries).map((view) => entryRow(view, true))
                    : []),
                ]
              : bestHit
                ? [hitRow(bestHit, false)]
                : [],
          },
          {
            key: "lists",
            heading: t("CommandPalette.groups.listsAndViews"),
            rows: listGroups(ranked, entries, bestKey).slice(0, 5).flatMap(listRows),
          },
          {
            key: "records",
            heading: t("CommandPalette.groups.records"),
            rows: hits.filter((hit) => recordSearchKey(hit) !== bestKey).map((hit) => hitRow(hit, false)),
          },
          {
            key: "pages",
            heading: t("CommandPalette.groups.pagesAndSettings"),
            rows: rankedOf(["page", "setting", "field"]).map((entry) => entryRow(entry)),
          },
          {
            key: "actions",
            heading: t("CommandPalette.groups.actions"),
            rows: rankedOf(["action"]).map((entry) => entryRow(entry)),
          },
          { key: "docs", heading: t("CommandPalette.groups.docs"), rows: docsRows },
          {
            key: "resolve",
            rows: resolvable
              ? [
                  {
                    key: "palette-resolve",
                    label: globalSearchModalStore.resolving
                      ? t("CommandPalette.resolving")
                      : t("CommandPalette.resolve", { query: term }),
                    icon: globalSearchModalStore.resolving ? Loader2 : WandSparkles,
                    onSelect: () => {
                      if (!globalSearchModalStore.resolving) resolveQuery();
                    },
                  },
                ]
              : [],
          },
        ]
      : [
          {
            key: "recent",
            heading: t("GlobalSearch.groupRecent"),
            rows: [
              ...globalSearchModalStore.recentCommandKeys.flatMap((key) => {
                const entry = entryByKey.get(key);
                return entry ? [entryRow(entry)] : [];
              }),
              ...recentItems.map((item) => hitRow(item, true)),
            ],
          },
          {
            key: "suggestions",
            heading: t("CommandPalette.groups.suggestions"),
            rows: suggestions.map((entry) => entryRow(entry)),
          },
        ];

  const visibleSections = sections.filter((section) => section.rows.length > 0);
  if (!isOpen || snapshot.current.term !== searchTerm) navigated.current = false;
  const orderedSections = navigated.current ? applyStableOrder(visibleSections, snapshot.current) : visibleSections;
  snapshot.current = {
    term: searchTerm,
    sections: orderedSections.map((section) => section.key),
    rows: new Map(orderedSections.map((section) => [section.key, section.rows.map((row) => row.key)])),
  };

  const showAskMate = mateAvailable && !level && !(recordsPending && visibleSections.length === 0);
  const showNoResults = hasQuery && !recordsPending && orderedSections.length === 0;
  const firstValue = orderedSections[0]?.rows[0]?.key ?? (showAskMate ? "palette-ask-mate" : "");
  const hasRecent = recentItems.length > 0 || globalSearchModalStore.recentCommandKeys.length > 0;

  useEffect(() => {
    if (!navigated.current) setSelectedValue((current) => (isOpen && current ? firstValue : ""));
  }, [firstValue, isOpen, level]);

  const onEscapeKeyDown = (event: KeyboardEvent) => {
    if (globalSearchModalStore.resolving) {
      event.preventDefault();
      globalSearchModalStore.cancelResolve();
      return;
    }
    if (!globalSearchModalStore.level) return;
    event.preventDefault();
    globalSearchModalStore.popLevel();
  };

  return (
    <CommandDialog
      commandProps={{ shouldFilter: false, value: selectedValue, onValueChange: setSelectedValue }}
      description={t("GlobalSearch.placeholder")}
      focusReturnFallback={globalSearchModalStore.focusReturnFallback}
      focusReturnTarget={globalSearchModalStore.focusReturnTarget}
      open={isOpen}
      title={t("GlobalSearch.placeholder")}
      onEscapeKeyDown={onEscapeKeyDown}
      onOpenChange={(next) => {
        if (!next) globalSearchModalStore.close();
      }}
    >
      {level && (
        <div className="flex shrink-0 items-center gap-1.5 px-3 pt-2 text-xs text-muted-foreground">
          <ChevronLeft aria-hidden className="size-3.5" />

          <span className="min-w-0 truncate">
            {editor?.titleText ? `${editor.titleText} · ${level.label}` : level.label}
          </span>
        </div>
      )}

      <div className="shrink-0" id="global-search-input">
        <CommandInput
          placeholder={t("GlobalSearch.placeholder")}
          value={searchTerm}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") navigated.current = true;
            if (event.key === "Backspace" && !searchTerm && globalSearchModalStore.level) {
              event.preventDefault();
              globalSearchModalStore.popLevel();
              return;
            }
            if (event.key !== "Tab" || event.shiftKey || !query || !mateAvailable || level) return;
            event.preventDefault();
            askMate();
          }}
          onValueChange={(next) => globalSearchModalStore.onChange("searchTerm", next)}
        />
      </div>

      {recordsPending && isLoading && (
        <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 shrink-0 animate-spin" />

          <span>{t("GlobalSearch.loading")}</span>
        </div>
      )}

      {globalSearchModalStore.resolveNotice && (
        <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground" role="status">
          {globalSearchModalStore.resolveNotice === "credits"
            ? t("CommandPalette.resolveNoCredits")
            : t("CommandPalette.resolveUnavailable")}
        </div>
      )}

      <CommandList>
        {level && editor && (
          <RecordCommandLevel
            editor={editor}
            level={level}
            query={searchTerm}
            onApplied={() => globalSearchModalStore.close()}
          />
        )}

        {showNoResults && <CommandEmpty persistent>{t("GlobalSearch.noResults")}</CommandEmpty>}

        {!level && !hasQuery && !scope && !hasRecent && orderedSections.length === 0 && (
          <CommandEmpty persistent className="px-8 py-12">
            <div className="mx-auto flex max-w-sm flex-col items-center gap-4 text-center">
              <div className="flex size-12 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground">
                <Search aria-hidden className="size-5" />
              </div>

              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-medium text-foreground">{t("GlobalSearch.emptyTitle")}</p>

                <p className="text-sm leading-6 text-muted-foreground">{t("GlobalSearch.emptyDescription")}</p>
              </div>
            </div>
          </CommandEmpty>
        )}

        {orderedSections.map((section) => (
          <CommandGroup key={section.key} heading={section.heading}>
            {section.rows.map((row) => (
              <PaletteRow key={row.key} row={row} />
            ))}

            {section.key === "recent" && (
              <CommandItem
                className="text-muted-foreground"
                value="global-search-clear-recent"
                onSelect={() => globalSearchModalStore.clearRecentItems()}
              >
                {t("Common.actions.clear")}
              </CommandItem>
            )}

            {section.key === "records" && results?.nextCursor && (
              <CommandItem
                className="text-muted-foreground"
                disabled={globalSearchModalStore.isLoadingMore}
                value="global-search-more"
                onSelect={() => runUserAction(globalSearchModalStore.loadMore)}
              >
                {globalSearchModalStore.isLoadingMore ? t("GlobalSearch.loading") : t("Common.actions.loadMore")}
              </CommandItem>
            )}
          </CommandGroup>
        ))}

        {showAskMate && (
          <CommandGroup>
            <CommandItem value="palette-ask-mate" onSelect={askMate}>
              <Sparkles className="size-4 shrink-0 text-muted-foreground" />

              <span className="min-w-0 flex-1 truncate">
                {query ? t("GlobalSearch.askMateWith", { question: query }) : t("AgentChat.askAi")}
              </span>

              {query ? <Kbd>Tab</Kbd> : <ShortcutKeys id="askMate" />}
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>

      <div className="flex shrink-0 items-center gap-4 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
        <Hint label={t("GlobalSearch.hintNavigate")} symbol="↑↓" />

        <Hint label={t("GlobalSearch.hintOpen")} symbol={<CornerDownLeft className="size-3" />} />

        {level && <Hint label={t("Common.actions.back")} symbol="Esc" />}

        {mateAvailable && query && !level && <Hint label={t("GlobalSearch.hintAskMate")} symbol="Tab" />}
      </div>
    </CommandDialog>
  );
});

function PaletteRow({ row }: { row: PaletteRowData }) {
  const { entry, hit } = row;
  const FallbackIcon = hit ? recordTypeIcon(hit.icon) : undefined;
  const Icon = row.icon;
  return (
    <CommandItem
      className={cn(
        row.indent && "pl-8",
        entry?.destructive && "text-destructive data-[selected=true]:text-destructive",
      )}
      value={row.key}
      onSelect={row.onSelect}
    >
      {hit && FallbackIcon ? (
        <Avatar>
          {hit.pictureUrl && <AvatarImage src={hit.pictureUrl} />}

          <AvatarFallback className="bg-transparent">
            {hit.pictureUrl ? initialsFor(row.label) : <FallbackIcon className="size-4 text-muted-foreground" />}
          </AvatarFallback>
        </Avatar>
      ) : (
        Icon && (
          <Icon
            aria-hidden
            className={cn("size-4 shrink-0", entry?.destructive ? "text-destructive" : "text-muted-foreground")}
          />
        )
      )}

      <span className="min-w-0 flex-1 truncate">{row.label}</span>

      {(row.subtitle ?? hit?.typeLabel) && (
        <span className="shrink-0 text-[11px] text-muted-foreground">{row.subtitle ?? hit?.typeLabel}</span>
      )}

      {entry?.shortcut && <ShortcutKeys id={entry.shortcut} />}
    </CommandItem>
  );
}

function Hint({ label, symbol }: { label: string; symbol: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <Kbd>{symbol}</Kbd>

      <span>{label}</span>
    </div>
  );
}
