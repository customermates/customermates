import type { RootStore } from "@/core/stores/root.store";
import type { WikiPageProposalReviewItem } from "@/features/wiki/wiki-page-proposal.schema";

import { action, computed, makeObservable, observable, runInAction } from "mobx";

import { BaseStore } from "@/core/base/base.store";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { serializedFailureErrorTree } from "@/core/validation/validation.utils";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

import { approveWikiPageProposalAction, getWikiPageProposalsAction, rejectWikiPageProposalAction } from "../actions";

export class WikiProposalsStore extends BaseStore {
  items: WikiPageProposalReviewItem[] = [];
  total = 0;
  requestState: "idle" | "loading" | "failed" = "idle";
  open = false;
  selectedId: string | null = null;
  reviewingId: string | null = null;

  private active = false;
  private generation = 0;

  constructor(
    rootStore: RootStore,
    private onApplied: () => void = () => {},
  ) {
    super(rootStore);
    makeObservable<this, "receive">(this, {
      items: observable.ref,
      total: observable,
      requestState: observable,
      open: observable,
      selectedId: observable,
      reviewingId: observable,
      selected: computed,
      setOpen: action,
      select: action,
      receive: action,
      approve: action,
      reject: action,
    });
  }

  get selected(): WikiPageProposalReviewItem | null {
    return this.items.find(({ id }) => id === this.selectedId) ?? null;
  }

  bind = () => {
    this.active = true;
    void this.load();
  };

  dispose = () => {
    this.active = false;
    this.generation += 1;
  };

  setOpen = (open: boolean) => {
    this.open = open;
    if (!open) this.selectedId = null;
    else void this.load();
  };

  select = (id: string | null) => {
    this.selectedId = id;
  };

  load = async () => {
    if (!this.active) return;
    const generation = ++this.generation;
    runInAction(() => {
      this.requestState = "loading";
    });
    try {
      const response = await getWikiPageProposalsAction();
      if (!this.active || generation !== this.generation) return;
      if (response.ok) this.receive(response.data.items, response.data.total);
      else {
        runInAction(() => {
          this.requestState = "failed";
        });
      }
    } catch (error: unknown) {
      if (!this.active || generation !== this.generation) return;
      reportApplicationError(error);
      runInAction(() => {
        this.requestState = "failed";
      });
    }
  };

  approve = (id: string) => this.review(id, "approve");

  reject = (id: string) => this.review(id, "reject");

  private receive(items: WikiPageProposalReviewItem[], total: number) {
    this.items = items;
    this.total = total;
    this.requestState = "idle";
    if (this.selectedId && !items.some(({ id }) => id === this.selectedId)) this.selectedId = null;
  }

  private review = async (id: string, decision: "approve" | "reject"): Promise<boolean> => {
    if (this.reviewingId) return false;
    runInAction(() => {
      this.reviewingId = id;
    });
    try {
      const response =
        decision === "approve"
          ? await approveWikiPageProposalAction({ id })
          : await rejectWikiPageProposalAction({ id });
      if (!response.ok) {
        toastZodErrorTree(serializedFailureErrorTree(response.failure));
        await this.load();
        return false;
      }
      runInAction(() => {
        this.receive(
          this.items.filter((item) => item.id !== id),
          Math.max(0, this.total - 1),
        );
      });
      this.toastSuccess(decision === "approve" ? "Wiki.proposals.approved" : "Wiki.proposals.rejected");
      if (decision === "approve") {
        this.onApplied();
        void this.load();
      }
      return true;
    } finally {
      runInAction(() => {
        this.reviewingId = null;
      });
    }
  };
}
