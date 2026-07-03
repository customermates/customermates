import type { RootStore } from "@/core/stores/root.store";
import { BaseStore } from "@/core/base/base.store";
import type { MessagingAttendee } from "@/ee/messaging/messaging.schema";
import type { IdentifierInput } from "@/features/contacts/contact.schema";

import { action, computed, makeObservable, observable, runInAction } from "mobx";

import { createContactByNameAction, getContactsAction } from "../../contacts/actions";

import { linkContactToThreadAction, unlinkContactFromThreadAction } from "../actions";

import { isHandleProvider } from "@/ee/messaging/provider";
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
      link: action,
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

  link = async (identifier: string, contactId: string): Promise<void> => {
    const picked = this.results.find((c) => c.id === contactId) ?? null;
    await this.mutate(
      () => {
        const args = this.linkArgsFor(identifier, contactId);
        return args ? linkContactToThreadAction(args) : Promise.resolve({ ok: true as const });
      },
      () =>
        this.rootStore.messagingThreadDetailStore.applyParticipantContact(
          this.threadId,
          identifier,
          picked
            ? {
                id: picked.id,
                firstName: picked.firstName,
                lastName: picked.lastName,
                avatarUrl: picked.avatarUrl,
              }
            : null,
        ),
    );
  };

  unlink = async (identifier: string): Promise<void> => {
    await this.mutate(
      () => {
        const args = this.unlinkArgsFor(identifier);
        return args ? unlinkContactFromThreadAction(args) : Promise.resolve({ ok: true as const });
      },
      () => this.rootStore.messagingThreadDetailStore.applyParticipantContact(this.threadId, identifier, null),
    );
  };

  createAndAssign = async (identifier: string, name: string): Promise<void> => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const linked = this.identifierInputFor(identifier);
    if (!linked) return;
    let createdContact: MessagingAttendee["contact"] = null;
    await this.mutate(
      async () => {
        const created = await createContactByNameAction(trimmed, this.rootStore.userStore.user?.id, linked);
        if (!created) return { ok: false as const };
        createdContact = {
          id: created.id,
          firstName: created.firstName,
          lastName: created.lastName,
          avatarUrl: created.avatarUrl ?? null,
        };
        return { ok: true as const };
      },
      () => {
        if (createdContact)
          this.rootStore.messagingThreadDetailStore.applyParticipantContact(this.threadId, identifier, createdContact);
      },
    );
  };

  private identifierInputFor(identifier: string): IdentifierInput | null {
    const thread = this.rootStore.messagingThreadDetailStore.thread;
    if (!thread) return null;

    const participant = thread.participants.find((p) => p.identifier === identifier) ?? null;
    return {
      provider: thread.provider,
      value: identifier,
      messagingId: isHandleProvider(thread.provider) ? identifier : undefined,
      displayName: participant?.displayName ?? undefined,
      profileUrl: participant?.profileUrl ?? undefined,
    };
  }

  private linkArgsFor(identifier: string, contactId: string) {
    const thread = this.rootStore.messagingThreadDetailStore.thread;
    if (!thread) return null;
    const participant = thread.participants.find((p) => p.identifier === identifier) ?? null;
    return {
      contactId,
      provider: thread.provider,
      identifier,
      displayName: participant?.displayName ?? undefined,
      profileUrl: participant?.profileUrl ?? undefined,
    };
  }

  private unlinkArgsFor(identifier: string) {
    const thread = this.rootStore.messagingThreadDetailStore.thread;
    const participant = thread?.participants.find((p) => p.identifier === identifier) ?? null;
    const ownerId = participant?.contact?.id;
    return thread && ownerId ? { contactId: ownerId, provider: thread.provider, identifier } : null;
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
