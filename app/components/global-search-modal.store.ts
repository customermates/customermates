import type { RootStore } from "@/core/stores/root.store";
import type { GlobalSearchResult, GlobalSearchResultItem } from "@/features/search/global-search.interactor";

import { action, makeObservable, observable, reaction } from "mobx";

import { BaseModalStore } from "@/core/base/base-modal.store";
import { Debouncer } from "@/core/utils/debounce";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { checkSearchResultExistsAction, globalSearchAction } from "@/app/[locale]/(protected)/search/actions";

type GlobalSearchFormData = {
  searchTerm: string;
};

type RecentSearchItem = GlobalSearchResultItem & { openedAt: number };

const RECENT_STORAGE_KEY = "customermates:globalSearch:recent:v1";
const RECENT_MAX = 8;

function readRecentFromStorage(): RecentSearchItem[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((it): it is RecentSearchItem => typeof it?.id === "string" && typeof it?.type === "string")
      : [];
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

  private debouncer = new Debouncer();

  constructor(rootStore: RootStore) {
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

  verifyRecentItem = async (item: GlobalSearchResultItem): Promise<boolean> => {
    const exists = await checkSearchResultExistsAction({ type: item.type, id: item.id });
    if (!exists) {
      this.removeRecentItem(item.id);
      this.toastError("GlobalSearch.staleItem");
    }
    return exists;
  };

  clearRecentItems = () => {
    this.recentItems = [];
    writeRecentToStorage(this.recentItems);
  };

  private setupSearchReaction = () => {
    reaction(
      () => this.form.searchTerm,
      (searchTerm) => {
        this.debouncer.run(() => this.setDebouncedSearchTerm(searchTerm));
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
          .then((result) => {
            if (result.ok) {
              this.setResults(result.data);
              return;
            }

            this.setResults(null);
            if (!toastZodErrorTree(result.error)) this.toastError("Common.notifications.unexpectedError");
          })
          .catch((error: unknown) => {
            this.setResults(null);
            reportApplicationError(error);
          })
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
          this.debouncer.cancel();
          this.setResults(null);
          this.setDebouncedSearchTerm("");
        }
      },
    );
  };
}
