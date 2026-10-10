import type { ChannelCandidateDto } from "@/ee/messaging/inbox/search-channel-candidates.interactor";
import type { RecordIdentityInput } from "@/features/records/record-identity.schema";
import type { MessagingProvider } from "@/generated/prisma";
import type { RecordEditorStore } from "./record-editor.store";

import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { Debouncer, SEARCH_DEBOUNCE_MS } from "@/core/utils/debounce";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { channelClass, isHandleProvider } from "@/ee/messaging/provider";
import { inferChannelProviders, normalizeChannelValue, parseChannelHandle } from "@/features/records/channel-value";
import { checkRecordIdentityAction, searchRecordChannelsAction } from "../../actions";
import { resolveProviderProfileAction } from "../../../inbox/actions";

type Candidate = { candidate: ChannelCandidateDto; source: "conversation" | "lookup" };
const key = (provider: MessagingProvider, value: string) => `${channelClass(provider)}:${value}`;

export class RecordChannelStore {
  open = false;
  query = "";
  candidates: Candidate[] = [];
  liveCandidate: Candidate | null = null;
  isSearching = false;
  isResolving = false;
  isAdding = false;
  searchError = false;
  private generation = 0;
  private searchDebouncer = new Debouncer(SEARCH_DEBOUNCE_MS);
  private lookupDebouncer = new Debouncer(600);

  constructor(private editor: RecordEditorStore) {
    makeObservable(this, {
      open: observable,
      query: observable,
      candidates: observable.ref,
      liveCandidate: observable.ref,
      isSearching: observable,
      isResolving: observable,
      isAdding: observable,
      searchError: observable,
      mergedCandidates: computed,
      addAsNewOptions: computed,
      reset: action,
      setOpen: action,
      setQuery: action,
    });
  }

  private get channelKeys() {
    return new Set(
      this.editor.form.identities.flatMap((row) => [
        key(row.provider, row.value),
        ...(row.messagingId ? [key(row.provider, row.messagingId)] : []),
      ]),
    );
  }
  get mergedCandidates() {
    const byKey = new Map<string, Candidate>();
    for (const tagged of [...(this.liveCandidate ? [this.liveCandidate] : []), ...this.candidates]) {
      const id = key(tagged.candidate.provider, tagged.candidate.value);
      if (!this.channelKeys.has(id) && !byKey.has(id)) byKey.set(id, tagged);
    }
    return [...byKey.values()];
  }
  get addAsNewOptions() {
    const candidates = new Set(this.mergedCandidates.map(({ candidate }) => key(candidate.provider, candidate.value)));
    return inferChannelProviders(this.query).filter((provider) => {
      const value = normalizeChannelValue(provider, this.query);
      return value && !this.channelKeys.has(key(provider, value)) && !candidates.has(key(provider, value));
    });
  }
  setOpen = (open: boolean) => {
    this.open = open;
    if (!open) this.reset();
  };
  setQuery = (query: string) => {
    this.query = query;
    this.generation += 1;
    this.searchDebouncer.cancel();
    this.lookupDebouncer.cancel();
    this.candidates = [];
    this.liveCandidate = null;
    this.searchError = false;
    this.isSearching = false;
    this.isResolving = false;
    if (query.trim().length < 2 || this.editor.isDisabled) return;
    const users = this.editor.rootStore.userStore;
    if (users.can("inboxMessages", "readAll") || users.can("inboxMessages", "readOwn")) {
      this.isSearching = true;
      this.searchDebouncer.run(() => void this.refreshLocal());
    }
    if (this.handleProvider(query) && users.can("inboxMessages", "create")) {
      this.isResolving = true;
      this.lookupDebouncer.run(() => void this.refreshLive());
    }
  };
  retrySearch = (): Promise<void> => {
    this.setQuery(this.query);
    return Promise.resolve();
  };
  private handleProvider(query: string) {
    const providers = inferChannelProviders(query);
    return providers.length === 1 && isHandleProvider(providers[0]) ? providers[0] : null;
  }
  private current(generation: number, query: string) {
    return this.open && this.generation === generation && this.query.trim() === query && !this.editor.isDisabled;
  }
  private refreshLocal = async () => {
    const query = this.query.trim(),
      generation = this.generation;
    try {
      const result = await searchRecordChannelsAction({ query });
      runInAction(() => {
        if (!this.current(generation, query)) return;
        if (result.ok) this.candidates = result.data.map((candidate) => ({ candidate, source: "conversation" }));
        else this.searchError = true;
      });
    } catch {
      runInAction(() => {
        if (this.current(generation, query)) this.searchError = true;
      });
    } finally {
      runInAction(() => {
        if (this.current(generation, query)) this.isSearching = false;
      });
    }
  };
  private resolve = async (provider: MessagingProvider, query: string) => {
    const accounts = this.editor.rootStore.connectedAccountsStore;
    await accounts.ensureLoaded();
    const [account] = accounts.usableSendersFor(provider);
    if (!account) return null;
    return resolveProviderProfileAction({
      connectedAccountId: account.id,
      identifier: parseChannelHandle(provider, query),
    });
  };
  private refreshLive = async () => {
    const query = this.query.trim(),
      generation = this.generation;
    const provider = this.handleProvider(query);
    try {
      const result = provider ? await this.resolve(provider, query) : null;
      runInAction(() => {
        if (!this.current(generation, query) || !result) return;
        if (!result.ok) {
          this.searchError = true;
          return;
        }
        this.liveCandidate = {
          source: "lookup",
          candidate: {
            provider: result.data.provider,
            value: result.data.publicIdentifier ?? parseChannelHandle(result.data.provider, query),
            messagingId: result.data.providerId,
            displayName: result.data.displayName,
            profileUrl: result.data.profileUrl,
          },
        };
      });
    } catch {
      runInAction(() => {
        if (this.current(generation, query)) this.searchError = true;
      });
    } finally {
      runInAction(() => {
        if (this.current(generation, query)) this.isResolving = false;
      });
    }
  };
  selectCandidate = async (candidate: ChannelCandidateDto) => {
    await this.add({
      ...candidate,
      messagingId: candidate.messagingId ?? (isHandleProvider(candidate.provider) ? candidate.value : null),
    });
  };
  addAsNew = async (provider: MessagingProvider) => {
    if (this.editor.isDisabled || this.isAdding) return;
    const query = this.query.trim(),
      generation = this.generation;
    const value = normalizeChannelValue(provider, query);
    if (!value) return;
    let identity: RecordIdentityInput = { provider, value };
    if (isHandleProvider(provider) && this.editor.rootStore.userStore.can("inboxMessages", "create")) {
      const resolved = await this.resolve(provider, query);
      if (!this.current(generation, query)) return;
      if (resolved?.ok) {
        identity = {
          provider,
          value: resolved.data.publicIdentifier ?? value,
          messagingId: resolved.data.providerId,
          displayName: resolved.data.displayName,
          profileUrl: resolved.data.profileUrl,
        };
      }
    }
    await this.add(identity);
  };
  private add = async (identity: RecordIdentityInput) => {
    if (this.editor.isDisabled || this.isAdding || this.channelKeys.has(key(identity.provider, identity.value))) return;
    const generation = this.generation,
      query = this.query.trim();
    const typeId = this.editor.presentation.typeId,
      recordId = this.editor.record?.ref.recordId;
    runInAction(() => {
      this.isAdding = true;
    });
    try {
      const result = await checkRecordIdentityAction({ typeId, ...(recordId ? { recordId } : {}), identity });
      if (
        !this.current(generation, query) ||
        this.editor.presentation.typeId !== typeId ||
        this.editor.record?.ref.recordId !== recordId
      )
        return;
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }
      this.editor.onChange("identities", [...this.editor.form.identities, identity]);
      this.reset();
    } finally {
      runInAction(() => {
        this.isAdding = false;
      });
    }
  };
  reset = () => {
    this.generation += 1;
    this.searchDebouncer.cancel();
    this.lookupDebouncer.cancel();
    this.open = false;
    this.query = "";
    this.candidates = [];
    this.liveCandidate = null;
    this.searchError = false;
    this.isSearching = false;
    this.isResolving = false;
  };
}
