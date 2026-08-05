import type { RootStore } from "@/core/stores/root.store";
import type { ChannelCandidateDto } from "@/ee/messaging/inbox/search-channel-candidates.interactor";
import type { ContactDto } from "@/features/contacts/contact.schema";
import type { IdentifierInput } from "@/features/contacts/contact.schema";

import { action, computed, makeObservable, observable, runInAction } from "mobx";

import type { MessagingProvider } from "@/generated/prisma";
import { Resource } from "@/generated/prisma";

import { checkChannelConflictAction, getContactsAction, searchChannelCandidatesAction } from "../actions";
import { resolveProviderProfileAction } from "../../inbox/actions";

import { BaseFormStore } from "@/core/base/base-form.store";
import { isHandleProvider } from "@/ee/messaging/provider";
import { inferChannelProviders, normalizeChannelValue, parseChannelHandle } from "@/features/contacts/channel-value";
import { identifierKey } from "@/features/contacts/upsert/validate-identifiers";
import { Debouncer, SEARCH_DEBOUNCE_MS } from "@/core/utils/debounce";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

const MIN_QUERY_LENGTH = 2;
const LOOKUP_DEBOUNCE_MS = 600;

type CandidateSource = "conversation" | "contact" | "lookup";
type TaggedCandidate = { candidate: ChannelCandidateDto; source: CandidateSource };
const SOURCE_PRIORITY: Record<CandidateSource, number> = { lookup: 0, contact: 1, conversation: 2 };

type AddChannelForm = { value: string };

export class AddChannelStore extends BaseFormStore<AddChannelForm> {
  open = false;
  query = "";
  candidates: TaggedCandidate[] = [];
  liveCandidate: TaggedCandidate | null = null;
  isSearching = false;
  isResolving = false;
  contactId: string | undefined = undefined;

  private searchDebouncer = new Debouncer(SEARCH_DEBOUNCE_MS);
  private lookupDebouncer = new Debouncer(LOOKUP_DEBOUNCE_MS);

  constructor(rootStore: RootStore) {
    super(rootStore, { value: "" }, Resource.contacts);

    makeObservable(this, {
      open: observable,
      query: observable,
      candidates: observable,
      liveCandidate: observable,
      isSearching: observable,
      isResolving: observable,
      contactId: observable,
      contactChannelKeys: computed,
      mergedCandidates: computed,
      addAsNewOptions: computed,
      reset: action,
      setOpen: action,
      setQuery: action,
      setContactId: action,
      selectCandidate: action,
      addAsNew: action,
    });
  }

  setContactId = (contactId: string | undefined) => {
    this.contactId = contactId;
  };

  setOpen = (next: boolean) => {
    this.open = next;
    if (!next) this.reset();
  };

  get contactChannelKeys(): Set<string> {
    return new Set(this.rootStore.contactDetailStore.channels.map((c) => identifierKey(c.provider, c.value)));
  }

  get mergedCandidates(): TaggedCandidate[] {
    const contactKeys = this.contactChannelKeys;
    const byKey = new Map<string, TaggedCandidate>();
    for (const tagged of [...this.candidates, ...(this.liveCandidate ? [this.liveCandidate] : [])]) {
      const key = identifierKey(tagged.candidate.provider, tagged.candidate.value);
      if (contactKeys.has(key)) continue;
      const existing = byKey.get(key);
      if (!existing || SOURCE_PRIORITY[tagged.source] < SOURCE_PRIORITY[existing.source]) byKey.set(key, tagged);
    }
    return [...byKey.values()];
  }

  get addAsNewOptions(): MessagingProvider[] {
    const contactKeys = this.contactChannelKeys;
    const candidateKeys = new Set(
      this.mergedCandidates.map((t) => identifierKey(t.candidate.provider, t.candidate.value)),
    );
    return inferChannelProviders(this.query).filter((provider) => {
      const value = normalizeChannelValue(provider, this.query);
      if (!value) return false;
      const key = identifierKey(provider, value);
      return !candidateKeys.has(key) && !contactKeys.has(key);
    });
  }

  setQuery = (value: string) => {
    this.query = value;
    this.searchDebouncer.cancel();
    this.lookupDebouncer.cancel();

    const trimmed = value.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      this.candidates = [];
      this.liveCandidate = null;
      this.isSearching = false;
      this.isResolving = false;
      return;
    }

    this.isSearching = true;
    this.searchDebouncer.run(() => void this.refreshLocal());

    if (this.singleHandleProvider(trimmed)) {
      this.isResolving = true;
      this.lookupDebouncer.run(() => void this.refreshLive());
    } else {
      this.liveCandidate = null;
      this.isResolving = false;
    }
  };

  selectCandidate = async (candidate: ChannelCandidateDto): Promise<void> => {
    const messagingId = candidate.messagingId ?? (isHandleProvider(candidate.provider) ? candidate.value : undefined);

    const conflict = await checkChannelConflictAction({
      provider: candidate.provider,
      value: candidate.value,
      messagingId: messagingId ?? undefined,
      contactId: this.contactId,
    });
    if (!conflict.ok) {
      toastZodErrorTree(conflict.error);
      return;
    }

    this.rootStore.contactDetailStore.addChannel({
      provider: candidate.provider,
      value: candidate.value,
      messagingId: messagingId ?? undefined,
      displayName: candidate.displayName ?? undefined,
      profileUrl: candidate.profileUrl ?? undefined,
    });
    this.close();
  };

  addAsNew = async (provider: MessagingProvider): Promise<void> => {
    if (this.isLoading) return;
    const raw = this.query.trim();

    this.setIsLoading(true);
    try {
      let input: IdentifierInput = { provider, value: raw };

      if (isHandleProvider(provider)) {
        const handle = parseChannelHandle(provider, raw);
        input = { provider, value: handle };

        await this.rootStore.connectedAccountsStore.ensureLoaded();
        const [account] = this.rootStore.connectedAccountsStore.usableSendersFor(provider);
        if (account) {
          const resolved = await resolveProviderProfileAction({ connectedAccountId: account.id, identifier: handle });
          if (resolved.ok) {
            input = {
              provider,
              value: resolved.data.publicIdentifier ?? handle,
              messagingId: resolved.data.providerId,
              displayName: resolved.data.displayName ?? undefined,
              profileUrl: resolved.data.profileUrl ?? undefined,
            };
          }
        }
      } else input = { provider, value: normalizeChannelValue(provider, raw) ?? raw };

      const conflict = await checkChannelConflictAction({
        provider: input.provider,
        value: input.value,
        messagingId: input.messagingId,
        contactId: this.contactId,
      });
      if (!conflict.ok) {
        toastZodErrorTree(conflict.error);
        return;
      }

      this.rootStore.contactDetailStore.addChannel(input);
      this.close();
    } finally {
      this.setIsLoading(false);
    }
  };

  private singleHandleProvider(query: string): MessagingProvider | null {
    const providers = inferChannelProviders(query);
    return providers.length === 1 && isHandleProvider(providers[0]) ? providers[0] : null;
  }

  private refreshLocal = async (): Promise<void> => {
    const requested = this.query.trim();
    if (requested.length < MIN_QUERY_LENGTH) return;

    const [participants, contacts] = await Promise.all([
      searchChannelCandidatesAction({ query: requested }),
      getContactsAction({ searchTerm: requested, pagination: { page: 1, pageSize: 10 } }),
    ]);

    runInAction(() => {
      if (this.query.trim() !== requested) return;
      this.candidates = [
        ...this.contactCandidates(contacts.items, requested),
        ...participants.map((candidate): TaggedCandidate => ({ source: "conversation", candidate })),
      ];
      this.isSearching = false;
    });
  };

  private refreshLive = async (): Promise<void> => {
    const requested = this.query.trim();
    const provider = this.singleHandleProvider(requested);
    if (!provider) {
      runInAction(() => (this.isResolving = false));
      return;
    }

    await this.rootStore.connectedAccountsStore.ensureLoaded();
    const [account] = this.rootStore.connectedAccountsStore.usableSendersFor(provider);
    if (!account) {
      runInAction(() => {
        if (this.query.trim() === requested) this.liveCandidate = null;
        this.isResolving = false;
      });
      return;
    }

    const handle = parseChannelHandle(provider, requested);
    const resolved = await resolveProviderProfileAction({ connectedAccountId: account.id, identifier: handle });

    runInAction(() => {
      if (this.query.trim() !== requested) return;
      this.isResolving = false;
      if (!resolved.ok) return;
      this.liveCandidate = {
        source: "lookup",
        candidate: {
          provider,
          value: resolved.data.publicIdentifier ?? handle,
          displayName: resolved.data.displayName ?? null,
          profileUrl: resolved.data.profileUrl ?? null,
          messagingId: resolved.data.providerId,
        },
      };
    });
  };

  private contactCandidates(contacts: ContactDto[], query: string): TaggedCandidate[] {
    const needle = query.toLowerCase();
    const valueQuery = inferChannelProviders(query).length > 0;
    const out: TaggedCandidate[] = [];
    for (const contact of contacts) {
      for (const identifier of contact.identifiers) {
        if (valueQuery && !identifier.value.toLowerCase().includes(needle)) continue;
        out.push({
          source: "contact",
          candidate: {
            provider: identifier.provider,
            value: identifier.value,
            displayName: identifier.displayName,
            profileUrl: identifier.profileUrl,
            messagingId: identifier.messagingId,
          },
        });
      }
    }
    return out;
  }

  private close = () => {
    runInAction(() => {
      this.open = false;
      this.reset();
    });
  };

  reset = () => {
    this.open = false;
    this.query = "";
    this.candidates = [];
    this.liveCandidate = null;
    this.isSearching = false;
    this.isResolving = false;
    this.searchDebouncer.cancel();
    this.lookupDebouncer.cancel();
    this.onInitOrRefresh({ value: "" });
  };
}
