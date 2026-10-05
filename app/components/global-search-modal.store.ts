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
import { globalSearchAction, resolveSearchReferencesAction } from "@/app/[locale]/(protected)/search/actions";
import { recordSearchKey, StoredSearchReferenceSchema } from "@/features/records/record-search.schema";

const PREFIX = "customermates:globalSearch:recent:v3";
const RECENT_MAX = 8;

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

export class GlobalSearchModalStore extends BaseModalStore<{ searchTerm: string }> {
  results: RecordSearchResult | null = null;
  debouncedSearchTerm = "";
  recentItems: RecordSearchHit[] = [];
  isLoadingMore = false;
  private scope: string | null;
  private request = 0;
  private recentRequest = 0;
  private debouncer = new Debouncer(250);

  constructor(rootStore: RootStore) {
    super(rootStore, { searchTerm: "" });
    this.scope = actorScope(rootStore);
    makeObservable(this, {
      results: observable.ref,
      debouncedSearchTerm: observable,
      recentItems: observable.ref,
      isLoadingMore: observable,
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
        this.setRecentItems([]);
        if (this.isOpen) void this.refreshRecentItems();
      },
    );
    reaction(
      () => this.form.searchTerm,
      (term) => {
        this.request += 1;
        this.setIsLoading(false);
        this.setIsLoadingMore(false);
        this.setResults(null);
        this.debouncer.run(() => {
          this.setDebouncedSearchTerm(term.trim());
          if (this.isOpen && term.trim()) void this.search(false);
        });
      },
    );
    reaction(
      () => this.isOpen,
      (open) => {
        this.resetSearch();
        if (open) {
          this.recentRequest += 1;
          this.setRecentItems([]);
          this.resetForm();
          void this.refreshRecentItems();
        }
      },
    );
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

  private resetSearch = () => {
    this.request += 1;
    this.debouncer.cancel();
    this.setResults(null);
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
    persist(this.scope, []);
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
      request === this.request && scope === this.scope && this.isOpen && this.form.searchTerm.trim() === term;
    try {
      const result = await globalSearchAction({ searchTerm: term, limit: 40, cursor: previous?.nextCursor ?? null });
      if (!current()) return;
      if (!result.ok) {
        if (!append) this.setResults(null);
        if (!toastZodErrorTree(result.error)) this.toastError("Common.notifications.unexpectedError");
        return;
      }
      const seen = new Set((previous?.results ?? []).map(recordSearchKey));
      this.setResults({
        ...result.data,
        results: [
          ...(previous?.results ?? []),
          ...result.data.results.filter((item) => !seen.has(recordSearchKey(item))),
        ],
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
