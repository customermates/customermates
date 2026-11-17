import { action, makeObservable, observable, runInAction } from "mobx";

import { reportApplicationError } from "@/core/errors/report-application-error";
import { notifyIfWorkspaceChanged } from "@/core/errors/workspace-changed-notice";
import { Debouncer } from "@/core/utils/debounce";

import { searchWikiPagesAction } from "../actions";

const NOTHING_FOUND: ReadonlySet<string> = new Set();
const MINIMUM_CONTENT_QUERY = 2;

export class WikiSearchStore {
  query = "";
  found: ReadonlySet<string> = NOTHING_FOUND;

  private generation = 0;
  private debouncer = new Debouncer();

  constructor() {
    makeObservable(this, {
      query: observable,
      found: observable.ref,
      setQuery: action,
      dispose: action,
    });
  }

  setQuery = (value: string) => {
    this.query = value;
    const generation = ++this.generation;
    const query = value.trim();
    if (query.length < MINIMUM_CONTENT_QUERY) {
      this.debouncer.cancel();
      this.found = NOTHING_FOUND;
      return;
    }
    this.debouncer.run(() => void this.search(query, generation));
  };

  dispose = () => {
    this.generation += 1;
    this.debouncer.cancel();
  };

  private search = async (query: string, generation: number) => {
    try {
      const response = await searchWikiPagesAction({ query, page: 1, pageSize: 25 });
      if (notifyIfWorkspaceChanged(response) || generation !== this.generation) return;
      runInAction(() => {
        this.found = response.ok ? new Set(response.data.items.map((item) => item.id)) : NOTHING_FOUND;
      });
    } catch (error: unknown) {
      if (notifyIfWorkspaceChanged(error) || generation !== this.generation) return;
      reportApplicationError(error);
    }
  };
}
