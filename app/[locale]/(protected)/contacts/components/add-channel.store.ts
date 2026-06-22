import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { ChannelCandidateDto } from "@/ee/messaging/inbox/search-channel-candidates.interactor";
import type { IdentifierInput } from "@/features/contacts/contact.schema";

import { action, makeObservable, observable, runInAction } from "mobx";

import { MessagingProvider, Resource } from "@/generated/prisma";

import { checkChannelConflictAction, searchChannelCandidatesAction } from "../actions";
import { resolveProviderProfileAction } from "../../inbox/actions";

import { BaseFormStore } from "@/core/base/base-form.store";
import { isHandleProvider } from "@/ee/messaging/provider";
import { parseChannelHandle } from "@/features/contacts/channel-value";
import { Debouncer } from "@/core/utils/debounce";

const MIN_QUERY_LENGTH = 2;

type ManualChannelForm = { provider: MessagingProvider; value: string };

const INITIAL: ManualChannelForm = {
  provider: MessagingProvider.mail,
  value: "",
};

export class AddChannelStore extends BaseFormStore<ManualChannelForm> {
  open = false;
  query = "";
  candidates: ChannelCandidateDto[] = [];
  isSearching = false;
  manualMode = false;
  contactId: string | undefined = undefined;

  private debouncer = new Debouncer();

  constructor(rootStore: RootStore) {
    super(rootStore, { ...INITIAL }, Resource.contacts);

    makeObservable(this, {
      open: observable,
      query: observable,
      candidates: observable,
      isSearching: observable,
      manualMode: observable,
      contactId: observable,
      reset: action,
      setOpen: action,
      setQuery: action,
      setManualMode: action,
      setContactId: action,
      changeProvider: action,
      linkCandidate: action,
      onSubmit: action,
    });
  }

  setContactId = (contactId: string) => {
    this.contactId = contactId;
  };

  setOpen = (next: boolean) => {
    this.open = next;
    if (!next) this.reset();
  };

  setManualMode = (next: boolean) => {
    this.setError(undefined);
    this.manualMode = next;
    if (next) {
      this.query = "";
      this.candidates = [];
      this.isSearching = false;
      this.debouncer.cancel();
      this.onInitOrRefresh({ ...INITIAL });
    }
  };

  changeProvider = (provider: string) => {
    this.onChange("provider", provider);
    this.onChange("value", "");
    this.setError(undefined);
  };

  setQuery = (value: string) => {
    this.query = value;
    this.debouncer.cancel();

    if (value.trim().length < MIN_QUERY_LENGTH) {
      this.candidates = [];
      this.isSearching = false;
      return;
    }

    this.isSearching = true;
    this.debouncer.run(() => void this.refresh());
  };

  linkCandidate = async (candidate: ChannelCandidateDto): Promise<void> => {
    const messagingId = isHandleProvider(candidate.provider) ? candidate.value : undefined;

    const conflict = await checkChannelConflictAction({
      provider: candidate.provider,
      value: candidate.value,
      messagingId,
      contactId: this.contactId,
    });
    if (!conflict.ok) {
      this.setError(conflict.error);
      return;
    }

    this.rootStore.contactDetailStore.addChannel({
      provider: candidate.provider,
      value: candidate.value,
      messagingId,
      displayName: candidate.displayName ?? undefined,
      profileUrl: candidate.profileUrl ?? undefined,
    });
    this.close();
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const provider = this.form.provider;
    const raw = this.form.value.trim();
    if (this.isLoading) return;

    this.setIsLoading(true);
    this.setError(undefined);
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
      }

      const conflict = await checkChannelConflictAction({
        provider: input.provider,
        value: input.value,
        messagingId: input.messagingId,
        contactId: this.contactId,
      });
      if (!conflict.ok) {
        this.setError(conflict.error);
        return;
      }

      this.rootStore.contactDetailStore.addChannel(input);
      this.close();
    } finally {
      this.setIsLoading(false);
    }
  };

  private close = () => {
    runInAction(() => {
      this.open = false;
      this.reset();
    });
  };

  private refresh = async (): Promise<void> => {
    const requestedQuery = this.query.trim();
    if (requestedQuery.length < MIN_QUERY_LENGTH) return;

    const results = await searchChannelCandidatesAction({
      query: requestedQuery,
    });
    runInAction(() => {
      if (this.query.trim() !== requestedQuery) return;
      this.candidates = results;
      this.isSearching = false;
    });
  };

  reset = () => {
    this.query = "";
    this.candidates = [];
    this.isSearching = false;
    this.manualMode = false;
    this.debouncer.cancel();
    this.onInitOrRefresh({ ...INITIAL });
  };
}
