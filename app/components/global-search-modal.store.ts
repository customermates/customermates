import type { RootStore } from "@/core/stores/root.store";
import type { GlobalSearchResult, GlobalSearchResultItem } from "@/features/search/global-search.interactor";

import { action, makeObservable, observable, reaction } from "mobx";
import { z } from "zod";

import { BaseModalStore } from "@/core/base/base-modal.store";
import { Debouncer } from "@/core/utils/debounce";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { checkSearchResultExistsAction, globalSearchAction } from "@/app/[locale]/(protected)/search/actions";
import { EntityType, TaskType } from "@/generated/prisma";

type GlobalSearchFormData = {
  searchTerm: string;
};

const RecentSearchItemSchema = z.object({
  type: z.enum(EntityType),
  id: z.uuid(),
  name: z.string(),
  pictureUrl: z.string().nullable(),
  taskType: z.enum(TaskType).optional(),
  openedAt: z.number().finite().nonnegative(),
});

type RecentSearchItem = GlobalSearchResultItem & z.infer<typeof RecentSearchItemSchema>;

const RECENT_STORAGE_PREFIX = "customermates:globalSearch:recent:v2";
const RECENT_MAX = 8;

function recentStorageKey(rootStore: RootStore): string | null {
  const user = rootStore.userStore.user;
  return user ? `${RECENT_STORAGE_PREFIX}:${user.companyId}:${user.id}` : null;
}

function readRecentFromStorage(storageKey: string | null): RecentSearchItem[] {
  if (!storageKey || typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const recent = RecentSearchItemSchema.safeParse(item);
      return recent.success ? [recent.data] : [];
    });
  } catch {
    return [];
  }
}

function writeRecentToStorage(storageKey: string | null, items: RecentSearchItem[]) {
  if (!storageKey || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(items));
  } catch {}
}

export class GlobalSearchModalStore extends BaseModalStore<GlobalSearchFormData> {
  public results: GlobalSearchResult | null = null;
  public debouncedSearchTerm = "";
  public recentItems: RecentSearchItem[] = [];

  private debouncer = new Debouncer();
  private recentStorageKey: string | null = null;

  constructor(rootStore: RootStore) {
    super(rootStore, {
      searchTerm: "",
    });

    this.recentStorageKey = recentStorageKey(rootStore);
    this.recentItems = readRecentFromStorage(this.recentStorageKey);

    makeObservable<this, "syncRecentScope">(this, {
      results: observable,
      debouncedSearchTerm: observable,
      recentItems: observable,
      setResults: action,
      setDebouncedSearchTerm: action,
      pushRecentItem: action,
      removeRecentItem: action,
      clearRecentItems: action,
      syncRecentScope: action,
    });

    this.setupSearchReaction();
    reaction(
      () => recentStorageKey(rootStore),
      () => this.syncRecentScope(),
    );
  }

  setDebouncedSearchTerm = (term: string) => {
    this.debouncedSearchTerm = term;
  };

  setResults = (results: GlobalSearchResult | null) => {
    this.results = results;
  };

  pushRecentItem = (item: GlobalSearchResultItem) => {
    this.syncRecentScope();
    const next: RecentSearchItem = { ...item, openedAt: Date.now() };
    const filtered = this.recentItems.filter((it) => !(it.type === item.type && it.id === item.id));
    this.recentItems = [next, ...filtered].slice(0, RECENT_MAX);
    writeRecentToStorage(this.recentStorageKey, this.recentItems);
  };

  removeRecentItem = (id: string, type: EntityType) => {
    this.syncRecentScope();
    this.recentItems = this.recentItems.filter((item) => item.id !== id || item.type !== type);
    writeRecentToStorage(this.recentStorageKey, this.recentItems);
  };

  verifyRecentItem = async (item: GlobalSearchResultItem): Promise<boolean> => {
    this.syncRecentScope();
    const storageKey = this.recentStorageKey;
    const exists = await checkSearchResultExistsAction({
      type: item.type,
      id: item.id,
    });
    this.syncRecentScope();
    if (storageKey !== this.recentStorageKey) return false;
    if (!exists) {
      this.removeRecentItem(item.id, item.type);
      this.toastError("GlobalSearch.staleItem");
    }
    return exists;
  };

  clearRecentItems = () => {
    this.syncRecentScope();
    this.recentItems = [];
    writeRecentToStorage(this.recentStorageKey, this.recentItems);
  };

  private syncRecentScope = () => {
    const storageKey = recentStorageKey(this.rootStore);
    if (storageKey === this.recentStorageKey) return;
    this.recentStorageKey = storageKey;
    this.recentItems = readRecentFromStorage(storageKey);
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
