import type { RootStore } from "@/core/stores/root.store";
import type { RecordRef } from "@/features/records/record-model.schema";
import type {
  RecordSearchHit,
  RecordSearchResult,
  StoredSearchReference,
} from "@/features/records/record-search.schema";

import { action, makeObservable, observable, reaction } from "mobx";
import { BaseModalStore } from "@/core/base/base-modal.store";
import { Debouncer } from "@/core/utils/debounce";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import type { CommandCatalog } from "@/features/command-palette/command-catalog.schema";
import {
  commandCatalogAction,
  commandSearchAction,
  globalSearchAction,
  resolveSearchReferencesAction,
} from "@/app/[locale]/(protected)/search/actions";
import { recordSearchKey, StoredSearchReferenceSchema } from "@/features/records/record-search.schema";
import type { CommandDocsHit } from "@/features/command-palette/command-search.schema";
import { DEFAULT_LOCALE, isAppLocale } from "@/i18n/locale-registry";
import { parsePaletteQuery } from "./command-palette/command-palette-search";

const PREFIX = "customermates:globalSearch:recent:v3";
const COMMAND_PREFIX = "customermates:commandPalette:recent:v1";
const RECENT_MAX = 8;
const RECENT_COMMANDS_MAX = 5;

export type PaletteLevel =
  | { kind: "field"; fieldId: string; label: string }
  | { kind: "assign"; label: string }
  | { kind: "link"; relationId: string; direction: "outgoing" | "incoming"; label: string };

function actorScope(root: RootStore) {
  const user = root.userStore.user;
  return user ? `${user.companyId}:${user.id}` : null;
}

function storedReferences(scope: string | null): StoredSearchReference[] {
  if (!scope || typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(`${PREFIX}:${scope}`) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, RECENT_MAX).flatMap((raw: unknown) => {
      const result = StoredSearchReferenceSchema.safeParse(raw);
      return result.success ? [result.data] : [];
    });
  } catch {
    return [];
  }
}

function persist(scope: string | null, refs: RecordRef[]) {
  if (!scope || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${PREFIX}:${scope}`, JSON.stringify(refs));
  } catch {}
}

function storedCommandKeys(scope: string | null): string[] {
  if (!scope || typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(`${COMMAND_PREFIX}:${scope}`) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((key): key is string => typeof key === "string").slice(0, RECENT_COMMANDS_MAX)
      : [];
  } catch {
    return [];
  }
}

function persistCommandKeys(scope: string | null, keys: string[]) {
  if (!scope || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${COMMAND_PREFIX}:${scope}`, JSON.stringify(keys));
  } catch {}
}

export class GlobalSearchModalStore extends BaseModalStore<{ searchTerm: string }> {
  results: RecordSearchResult | null = null;
  semantic: { key: string; similarity: number }[] = [];
  docs: CommandDocsHit[] = [];
  debouncedSearchTerm = "";
  recentItems: RecordSearchHit[] = [];
  recentCommandKeys: string[] = [];
  catalog: CommandCatalog | null = null;
  levels: PaletteLevel[] = [];
  isLoadingMore = false;
  private scope: string | null;
  private request = 0;
  private recentRequest = 0;
  private catalogRequest = 0;
  private debouncer = new Debouncer(150);

  constructor(rootStore: RootStore) {
    super(rootStore, { searchTerm: "" });
    this.scope = actorScope(rootStore);
    makeObservable(this, {
      results: observable.ref,
      semantic: observable.ref,
      docs: observable.ref,
      setCatalogHits: action,
      debouncedSearchTerm: observable,
      recentItems: observable.ref,
      recentCommandKeys: observable.ref,
      catalog: observable.ref,
      levels: observable.ref,
      isLoadingMore: observable,
      setCatalog: action,
      setRecentCommandKeys: action,
      pushLevel: action,
      popLevel: action,
      clearLevels: action,
      setResults: action,
      setDebouncedSearchTerm: action,
      setRecentItems: action,
      setIsLoadingMore: action,
    });
    reaction(
      () => actorScope(rootStore),
      (scope) => {
        this.scope = scope;
        this.resetSearch();
        this.recentRequest += 1;
        this.catalogRequest += 1;
        this.setRecentItems([]);
        this.setCatalog(null);
        this.setRecentCommandKeys(storedCommandKeys(scope));
        if (this.isOpen) {
          void this.refreshRecentItems();
          void this.refreshCatalog();
        }
      },
    );
    reaction(
      () => this.form.searchTerm,
      (term) => {
        this.request += 1;
        this.setIsLoading(false);
        this.setIsLoadingMore(false);
        this.setResults(null);
        this.setCatalogHits([], []);
        if (this.levels.length) return;
        const query = parsePaletteQuery(term);
        this.debouncer.run(() => {
          this.setDebouncedSearchTerm(query.term);
          if (this.isOpen && query.term) void this.search(false);
        });
      },
    );
    reaction(
      () => this.isOpen,
      (open) => {
        this.resetSearch();
        this.clearLevels();
        if (open) {
          this.recentRequest += 1;
          this.setRecentItems([]);
          this.setRecentCommandKeys(storedCommandKeys(this.scope));
          this.resetForm();
          void this.refreshRecentItems();
          void this.refreshCatalog();
        }
      },
    );
  }

  setCatalogHits = (semantic: { key: string; similarity: number }[], docs: CommandDocsHit[]) => {
    this.semantic = semantic;
    this.docs = docs;
  };

  private get searchLocale() {
    const locale = this.rootStore.localeStore.locale;
    return isAppLocale(locale) ? locale : DEFAULT_LOCALE;
  }

  setResults = (results: RecordSearchResult | null) => {
    this.results = results;
  };
  setDebouncedSearchTerm = (term: string) => {
    this.debouncedSearchTerm = term;
  };
  setRecentItems = (items: RecordSearchHit[]) => {
    this.recentItems = items;
  };
  setIsLoadingMore = (value: boolean) => {
    this.isLoadingMore = value;
  };
  setCatalog = (catalog: CommandCatalog | null) => {
    this.catalog = catalog;
  };
  setRecentCommandKeys = (keys: string[]) => {
    this.recentCommandKeys = keys;
  };

  get level(): PaletteLevel | null {
    return this.levels.at(-1) ?? null;
  }

  pushLevel = (level: PaletteLevel) => {
    this.levels = [...this.levels, level];
    this.resetSearch();
    this.onChange("searchTerm", "");
  };

  clearLevels = () => {
    this.levels = [];
  };

  popLevel = () => {
    this.levels = this.levels.slice(0, -1);
    this.onChange("searchTerm", "");
  };

  pushRecentCommand = (key: string) => {
    const keys = [key, ...storedCommandKeys(this.scope).filter((existing) => existing !== key)].slice(
      0,
      RECENT_COMMANDS_MAX,
    );
    this.setRecentCommandKeys(keys);
    persistCommandKeys(this.scope, keys);
  };

  refreshCatalog = async () => {
    const scope = this.scope;
    const request = ++this.catalogRequest;
    try {
      const result = await commandCatalogAction();
      if (scope !== this.scope || request !== this.catalogRequest) return;
      if (result.ok) this.setCatalog(result.data);
    } catch (error) {
      reportApplicationError(error);
    }
  };

  private resetSearch = () => {
    this.request += 1;
    this.debouncer.cancel();
    this.setResults(null);
    this.setCatalogHits([], []);
    this.setDebouncedSearchTerm("");
    this.setIsLoading(false);
    this.setIsLoadingMore(false);
  };

  private resolveRecent = async (refs: StoredSearchReference[]) => {
    const scope = this.scope;
    const request = ++this.recentRequest;
    try {
      const result = await resolveSearchReferencesAction({ refs });
      if (scope !== this.scope || request !== this.recentRequest) return;
      if (!result.ok) {
        this.setRecentItems([]);
        return;
      }
      const items = result.data.results.slice(0, RECENT_MAX);
      this.setRecentItems(items);
      persist(
        scope,
        items.map((item) => item.ref),
      );
    } catch (error) {
      if (scope === this.scope && request === this.recentRequest) this.setRecentItems([]);
      reportApplicationError(error);
    }
  };

  refreshRecentItems = () => this.resolveRecent(storedReferences(this.scope));

  pushRecentItem = (item: RecordSearchHit) => this.pushRecentReference(item.ref);

  pushRecentReference = (ref: StoredSearchReference) => {
    const references = storedReferences(this.scope);
    const key = JSON.stringify(ref);
    void this.resolveRecent(
      [ref, ...references.filter((existing) => JSON.stringify(existing) !== key)].slice(0, RECENT_MAX),
    );
  };

  clearRecentItems = () => {
    this.recentRequest += 1;
    this.setRecentItems([]);
    this.setRecentCommandKeys([]);
    persist(this.scope, []);
    persistCommandKeys(this.scope, []);
  };

  verifyRecentItem = async (item: RecordSearchHit) => {
    const scope = this.scope;
    const result = await resolveSearchReferencesAction({ refs: [item.ref] });
    if (scope !== this.scope) return false;
    if (!result.ok || !result.data.results.length) {
      this.setRecentItems(this.recentItems.filter((recent) => recordSearchKey(recent) !== recordSearchKey(item)));
      persist(
        scope,
        this.recentItems.map((recent) => recent.ref),
      );
      this.toastError("GlobalSearch.staleItem");
      return false;
    }
    return true;
  };

  loadMore = () => {
    if (!this.isLoading && !this.isLoadingMore && this.results?.nextCursor) return this.search(true);
    return Promise.resolve();
  };

  private search = async (append: boolean) => {
    const term = this.debouncedSearchTerm;
    const scope = this.scope;
    const request = ++this.request;
    const previous = append ? this.results : null;
    if (append) this.setIsLoadingMore(true);
    else this.setIsLoading(true);
    const current = () =>
      request === this.request &&
      scope === this.scope &&
      this.isOpen &&
      parsePaletteQuery(this.form.searchTerm).term === term;
    try {
      const records = append
        ? await globalSearchAction({ searchTerm: term, limit: 40, cursor: previous?.nextCursor ?? null })
        : null;
      const combined = append
        ? null
        : await commandSearchAction({
            searchTerm: term,
            scope: parsePaletteQuery(this.form.searchTerm).scope,
            locale: this.searchLocale,
          });
      if (!current()) return;
      const failure = records && !records.ok ? records.error : combined && !combined.ok ? combined.error : null;
      if (failure) {
        if (!append) this.setResults(null);
        if (!toastZodErrorTree(failure)) this.toastError("Common.notifications.unexpectedError");
        return;
      }
      const page = records?.ok ? records.data : combined?.ok ? combined.data.records : null;
      if (combined?.ok) this.setCatalogHits(combined.data.semantic, combined.data.docs);
      if (!page) return;
      const seen = new Set((previous?.results ?? []).map(recordSearchKey));
      this.setResults({
        ...page,
        results: [...(previous?.results ?? []), ...page.results.filter((item) => !seen.has(recordSearchKey(item)))],
      });
    } catch (error) {
      if (current() && !append) this.setResults(null);
      reportApplicationError(error);
    } finally {
      if (current()) {
        this.setIsLoading(false);
        this.setIsLoadingMore(false);
      }
    }
  };
}
