import type { RootStore } from "@/core/stores/root.store";
import { BaseStore } from "@/core/base/base.store";
import type { MessagingAttendee } from "@/ee/messaging/messaging.schema";

import { action, computed, makeObservable, observable, runInAction } from "mobx";

import { createContactByNameAction, getContactsAction } from "../../contacts/actions";

import { assignContactToThreadAction } from "../actions";

import { Debouncer } from "@/core/utils/debounce";

type ActionOutcome = { ok: boolean };

type ContactRow = {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
};

export class ThreadParticipantsStore extends BaseStore {
  isOpen = false;
  activeIdentifier: string | null = null;
  query = "";
  results: ContactRow[] = [];
  isLoading = false;
  pending = false;

  private threadId = "";
  private debouncer = new Debouncer();

  constructor(rootStore: RootStore) {
    super(rootStore);
    makeObservable(this, {
      isOpen: observable,
      activeIdentifier: observable,
      query: observable,
      results: observable,
      isLoading: observable,
      pending: observable,
      isSearching: computed,
      showCreate: computed,
      bind: action,
      setOpen: action,
      startLink: action,
      backToList: action,
      setQuery: action,
      assign: action,
      createAndAssign: action,
      unlink: action,
    });
  }

  get isSearching(): boolean {
    return this.activeIdentifier !== null;
  }

  get showCreate(): boolean {
    return this.query.trim().length > 0 && !this.isLoading && this.results.length === 0;
  }

  bind = (threadId: string) => {
    this.threadId = threadId;
    this.isOpen = false;
    this.reset();
  };

  setOpen = (next: boolean) => {
    this.isOpen = next;
    this.reset();
    if (!next) void this.rootStore.messagingThreadDetailStore.refresh();
  };

  startLink = (identifier: string) => {
    this.activeIdentifier = identifier;
    this.query = "";
    this.results = [];
    void this.refresh();
  };

  backToList = () => {
    this.activeIdentifier = null;
    this.query = "";
    this.results = [];
    this.debouncer.cancel();
  };

  setQuery = (value: string) => {
    this.query = value;
    this.debouncer.run(() => void this.refresh());
  };

  assign = async (identifier: string, contactId: string | null): Promise<void> => {
    const pickedFromResults = contactId ? (this.results.find((c) => c.id === contactId) ?? null) : null;
    await this.mutate(
      () =>
        assignContactToThreadAction({
          threadId: this.threadId,
          identifier,
          contactId,
        }),
      () =>
        this.applyContact(
          identifier,
          pickedFromResults
            ? {
                id: pickedFromResults.id,
                firstName: pickedFromResults.firstName,
                lastName: pickedFromResults.lastName,
                avatarUrl: pickedFromResults.avatarUrl,
              }
            : null,
        ),
    );
  };

  unlink = async (identifier: string): Promise<void> => {
    await this.mutate(
      () =>
        assignContactToThreadAction({
          threadId: this.threadId,
          identifier,
          contactId: null,
        }),
      () => this.applyContact(identifier, null),
    );
  };

  createAndAssign = async (identifier: string, name: string): Promise<void> => {
    const trimmed = name.trim();
    if (!trimmed) return;
    let createdContact: MessagingAttendee["contact"] = null;
    await this.mutate(
      async () => {
        const created = await createContactByNameAction(trimmed, this.rootStore.userStore.user?.id);
        if (!created) return { ok: false as const };
        createdContact = {
          id: created.id,
          firstName: created.firstName,
          lastName: created.lastName,
          avatarUrl: created.avatarUrl ?? null,
        };
        return assignContactToThreadAction({
          threadId: this.threadId,
          identifier,
          contactId: created.id,
        });
      },
      () => {
        if (createdContact) this.applyContact(identifier, createdContact);
      },
    );
  };

  private applyContact(identifier: string, contact: MessagingAttendee["contact"]) {
    this.rootStore.messagingThreadDetailStore.applyParticipantContact(this.threadId, identifier, contact);
  }

  private mutate = async (run: () => Promise<ActionOutcome>, applyOptimistic: () => void): Promise<void> => {
    runInAction(() => {
      this.pending = true;
    });
    let succeeded = false;
    try {
      const result = await run();
      succeeded = result.ok;
      if (succeeded) runInAction(() => applyOptimistic());
    } catch {
      succeeded = false;
    } finally {
      runInAction(() => {
        this.pending = false;
        this.activeIdentifier = null;
        this.query = "";
        this.results = [];
      });
      if (!succeeded) this.toastError("Inbox.participants.linkUpdateFailed");
    }
  };

  private reset() {
    this.activeIdentifier = null;
    this.query = "";
    this.results = [];
    this.isLoading = false;
    this.debouncer.cancel();
  }

  private refresh = async (): Promise<void> => {
    if (this.activeIdentifier === null) return;
    const requestedQuery = this.query;
    runInAction(() => {
      this.isLoading = true;
    });
    const result = await getContactsAction({
      searchTerm: requestedQuery,
      pagination: { page: 1, pageSize: 10 },
    });
    runInAction(() => {
      if (this.query !== requestedQuery) return;
      this.results = result.items.map((c) => ({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        avatarUrl: c.avatarUrl,
      }));
      this.isLoading = false;
    });
  };
}
