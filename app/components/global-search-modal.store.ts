import type { RootStore } from "@/core/stores/root.store";
import type { GlobalSearchResult, GlobalSearchResultItem } from "@/features/search/global-search.interactor";

import { action, makeObservable, observable, reaction } from "mobx";

import { BaseModalStore } from "@/core/base/base-modal.store";
import { globalSearchAction } from "@/app/[locale]/(protected)/search/actions";

type GlobalSearchFormData = {
  searchTerm: string;
};

export type RecentSearchItem = GlobalSearchResultItem & { openedAt: number };

const RECENT_STORAGE_KEY = "customermates:globalSearch:recent:v1";
const RECENT_MAX = 8;

function readRecentFromStorage(): RecentSearchItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (it): it is RecentSearchItem =>
        it &&
        typeof it === "object" &&
        typeof it.id === "string" &&
        typeof it.name === "string" &&
        typeof it.type === "string",
    );
  } catch {
    return [];
  }
}

function writeRecentToStorage(items: RecentSearchItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(items));
  } catch {}
}

export class GlobalSearchModalStore extends BaseModalStore<GlobalSearchFormData> {
  public results: GlobalSearchResult | null = null;
  public debouncedSearchTerm = "";
  public recentItems: RecentSearchItem[] = [];

  private debounceTimer?: ReturnType<typeof setTimeout>;

  constructor(public readonly rootStore: RootStore) {
    super(rootStore, {
      searchTerm: "",
    });

    this.recentItems = readRecentFromStorage();

    makeObservable(this, {
      results: observable,
      debouncedSearchTerm: observable,
      recentItems: observable,
      setResults: action,
      setDebouncedSearchTerm: action,
      pushRecentItem: action,
      removeRecentItem: action,
      clearRecentItems: action,
    });

    this.setupSearchReaction();
  }

  setDebouncedSearchTerm = (term: string) => {
    this.debouncedSearchTerm = term;
  };

  setResults = (results: GlobalSearchResult | null) => {
    this.results = results;
  };

  pushRecentItem = (item: GlobalSearchResultItem) => {
    const next: RecentSearchItem = { ...item, openedAt: Date.now() };
    const filtered = this.recentItems.filter((it) => !(it.type === item.type && it.id === item.id));
    this.recentItems = [next, ...filtered].slice(0, RECENT_MAX);
    writeRecentToStorage(this.recentItems);
  };

  removeRecentItem = (id: string) => {
    this.recentItems = this.recentItems.filter((it) => it.id !== id);
    writeRecentToStorage(this.recentItems);
  };

  clearRecentItems = () => {
    this.recentItems = [];
    writeRecentToStorage(this.recentItems);
  };

  private setupSearchReaction = () => {
    reaction(
      () => this.form.searchTerm,
      (searchTerm) => {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);

        this.debounceTimer = setTimeout(() => this.setDebouncedSearchTerm(searchTerm), 400);
      },
    );

    reaction(
      () => this.debouncedSearchTerm,
      (debouncedSearchTerm) => {
        if (!debouncedSearchTerm.trim()) {
          this.setResults(null);
          return;
        }

        this.setIsLoading(true);

        void globalSearchAction({ searchTerm: debouncedSearchTerm })
          .then((results) => this.setResults(results))
          .catch(() => this.setResults(null))
          .finally(() => this.setIsLoading(false));
      },
    );

    reaction(
      () => this.isOpen,
      (isOpen) => {
        if (isOpen) {
          this.setIsLoading(false);
          this.setResults(null);
          this.setDebouncedSearchTerm("");
          this.resetForm();
        } else {
          if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = undefined;
          }
          this.setResults(null);
          this.setDebouncedSearchTerm("");
        }
      },
    );
  };
}
