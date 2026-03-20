import type { RootStore } from "@/core/stores/root.store";
import type { GlobalSearchResult } from "@/features/search/global-search.interactor";

import { action, makeObservable, observable, reaction } from "mobx";

import { BaseModalStore } from "@/core/base/base-modal.store";
import { globalSearchAction } from "@/app/[locale]/(protected)/search/actions";

type GlobalSearchFormData = {
  searchTerm: string;
};

export class GlobalSearchModalStore extends BaseModalStore<GlobalSearchFormData> {
  public results: GlobalSearchResult | null = null;
  public debouncedSearchTerm = "";

  private debounceTimer?: ReturnType<typeof setTimeout>;

  constructor(public readonly rootStore: RootStore) {
    super(rootStore, {
      searchTerm: "",
    });

    makeObservable(this, {
      results: observable,
      debouncedSearchTerm: observable,
      setResults: action,
      setDebouncedSearchTerm: action,
    });

    this.setupSearchReaction();
  }

  setDebouncedSearchTerm = (term: string) => {
    this.debouncedSearchTerm = term;
  };

  setResults = (results: GlobalSearchResult | null) => {
    this.results = results;
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
