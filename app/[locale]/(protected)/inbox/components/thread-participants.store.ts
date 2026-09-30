import type { RootStore } from "@/core/stores/root.store";
import { BaseStore } from "@/core/base/base.store";
import type { RecordIdentityInput } from "@/features/records/record-identity.schema";
import type { RecordIdentityReference } from "@/features/records/record-identity-reference.schema";
import type { RecordRef } from "@/features/records/record-model.schema";
import type { IdentityRecordCreateChoice } from "@/features/records/get-identity-record-choices.interactor";
import type { MutateRecordInput, RecordOperationResult } from "@/features/records/record-query.schema";

import { action, computed, makeObservable, observable, runInAction, toJS } from "mobx";

import { getIdentityRecordChoicesAction } from "../actions";
import { getRecordAction, mutateRecordAction } from "../../records/actions";
import { channelClass } from "@/ee/messaging/provider";
import { normalizeChannelValue } from "@/features/contacts/channel-value";

import { isHandleProvider } from "@/ee/messaging/provider";
import { Debouncer } from "@/core/utils/debounce";
import { reportApplicationError } from "@/core/errors/report-application-error";

type ActionOutcome = { ok: boolean };

function identityInput(row: RecordIdentityInput): RecordIdentityInput {
  return {
    provider: row.provider,
    value: row.value,
    messagingId: row.messagingId,
    displayName: row.displayName,
    profileUrl: row.profileUrl,
  };
}

export class ThreadParticipantsStore extends BaseStore {
  isOpen = false;
  activeIdentifier: string | null = null;
  query = "";
  results: RecordIdentityReference[] = [];
  createTypes: IdentityRecordCreateChoice[] = [];
  schemaRevision = 0;
  pendingOperationId: string | null = null;
  isLoading = false;
  searchError = false;
  pending = false;
  canManageRecords = false;

  private retryMutation: { key: string; input: MutateRecordInput } | null = null;
  private threadId = "";
  private debouncer = new Debouncer();
  private searchGeneration = 0;

  constructor(rootStore: RootStore) {
    super(rootStore);
    makeObservable(this, {
      isOpen: observable,
      activeIdentifier: observable,
      query: observable,
      results: observable,
      createTypes: observable,
      pendingOperationId: observable,
      operationCompleted: action,
      isLoading: observable,
      searchError: observable,
      pending: observable,
      canManageRecords: observable,
      operationStopped: action,
      isSearching: computed,
      showCreate: computed,
      bind: action,
      setOpen: action,
      startLink: action,
      backToList: action,
      setQuery: action,
      retrySearch: action,
      link: action,
      createAndAssign: action,
      unlink: action,
    });
  }

  get isSearching(): boolean {
    return this.activeIdentifier !== null;
  }

  get showCreate(): boolean {
    return (
      this.createTypes.length > 0 &&
      this.query.trim().length > 0 &&
      !this.isLoading &&
      !this.searchError &&
      this.results.length === 0
    );
  }

  bind = (threadId: string) => {
    this.threadId = threadId;
    this.isOpen = false;
    this.reset();
    this.canManageRecords = false;
    void this.loadCapabilities(threadId);
  };

  setOpen = (next: boolean) => {
    this.isOpen = next;
    this.reset();
    if (!next) void this.rootStore.messagingThreadDetailStore.refresh().catch(reportApplicationError);
  };

  startLink = (identifier: string) => {
    this.activeIdentifier = identifier;
    this.query = "";
    this.results = [];
    this.searchError = false;
    void this.refresh();
  };

  backToList = () => {
    this.activeIdentifier = null;
    this.query = "";
    this.results = [];
    this.createTypes = [];
    this.isLoading = false;
    this.searchError = false;
    this.searchGeneration += 1;
    this.debouncer.cancel();
  };

  setQuery = (value: string) => {
    this.query = value;
    this.isLoading = true;
    this.searchError = false;
    this.searchGeneration += 1;
    this.debouncer.run(() => void this.refresh());
  };

  retrySearch = async (): Promise<void> => {
    this.searchError = false;
    await this.refresh();
  };

  link = async (identifier: string, reference: RecordRef): Promise<void> => {
    const ref = { typeId: reference.typeId, recordId: reference.recordId };
    const linked = this.identifierInputFor(identifier);
    if (!linked) return;
    await this.mutate(() =>
      this.executeMutation(`link:${JSON.stringify([ref, linked])}`, async () => {
        const loaded = await getRecordAction(toJS(ref));
        if (!loaded.ok) return null;
        const previous = loaded.data.identities?.map(identityInput) ?? [];
        if (
          !previous.some(
            (row) =>
              channelClass(row.provider) === channelClass(linked.provider) &&
              (row.value === linked.value || (linked.messagingId && row.messagingId === linked.messagingId)),
          )
        )
          previous.push(linked);
        return {
          expectedRevision: loaded.data.schemaRevision,
          idempotencyKey: crypto.randomUUID(),
          mutation: { action: "update", ref, expectedVersion: loaded.data.version, fields: [], identities: previous },
        };
      }),
    );
  };

  unlink = async (identifier: string): Promise<void> => {
    const thread = this.rootStore.messagingThreadDetailStore.thread;
    const reference = thread?.participants.find((participant) => participant.identifier === identifier)?.record?.ref;
    if (!reference || !thread) return;
    const ref = { typeId: reference.typeId, recordId: reference.recordId };
    await this.mutate(() =>
      this.executeMutation(`unlink:${JSON.stringify([ref, thread.provider, identifier])}`, async () => {
        const loaded = await getRecordAction(toJS(ref));
        if (!loaded.ok) return null;
        const normalized = normalizeChannelValue(thread.provider, identifier) ?? identifier;
        const identities =
          loaded.data.identities
            ?.filter(
              (row) =>
                !(
                  channelClass(row.provider) === channelClass(thread.provider) &&
                  (row.value === normalized || row.messagingId === identifier)
                ),
            )
            .map(identityInput) ?? [];
        return {
          expectedRevision: loaded.data.schemaRevision,
          idempotencyKey: crypto.randomUUID(),
          mutation: { action: "update", ref, expectedVersion: loaded.data.version, fields: [], identities },
        };
      }),
    );
  };

  createAndAssign = async (identifier: string, name: string, typeId?: string): Promise<void> => {
    const trimmed = name.trim();
    const linked = this.identifierInputFor(identifier);
    const choice = typeId
      ? this.createTypes.find((type) => type.typeId === typeId)
      : this.createTypes.length === 1
        ? this.createTypes[0]
        : null;
    if (!trimmed || !linked || !choice) return;
    await this.mutate(() =>
      this.executeMutation(`create:${JSON.stringify([choice.typeId, trimmed, linked])}`, () => {
        const [first, ...rest] = trimmed.split(/\s+/);
        return Promise.resolve({
          expectedRevision: this.schemaRevision,
          idempotencyKey: crypto.randomUUID(),
          mutation: {
            action: "create",
            typeId: choice.typeId,
            assignedUserIds: this.rootStore.userStore.user ? [this.rootStore.userStore.user.id] : [],
            fields: choice.nameFieldIds.map((fieldId, index) => ({
              fieldId,
              value: {
                kind: "text",
                value: choice.nameFieldIds.length === 1 ? trimmed : index === 0 ? first : rest.join(" "),
              },
            })),
            identities: [linked],
          },
        });
      }),
    );
  };

  operationCompleted = async () => {
    runInAction(() => {
      this.pendingOperationId = null;
    });
    await this.rootStore.messagingThreadDetailStore.refresh();
    await this.rootStore.recordWorkspaceStore.invalidate();
  };

  operationStopped = () => {
    this.pendingOperationId = null;
  };

  private async loadCapabilities(threadId: string) {
    try {
      const result = await getIdentityRecordChoicesAction("");
      runInAction(() => {
        if (this.threadId === threadId) this.canManageRecords = result.canManage;
      });
    } catch (error) {
      reportApplicationError(error);
    }
  }

  private async executeMutation(key: string, prepare: () => Promise<MutateRecordInput | null>): Promise<ActionOutcome> {
    const actor = this.rootStore.userStore.user;
    const scopedKey = JSON.stringify([actor?.companyId, actor?.id, key]);
    if (this.retryMutation?.key !== scopedKey) {
      const input = await prepare();
      if (!input) return { ok: false };
      this.retryMutation = { key: scopedKey, input };
    }
    const result = await mutateRecordAction(toJS(this.retryMutation.input));
    this.retryMutation = null;
    return result.ok ? this.acceptOperation(result.data) : { ok: false };
  }

  private acceptOperation(result: RecordOperationResult): ActionOutcome {
    if (result.status === "pending") {
      runInAction(() => {
        this.pendingOperationId = result.operationId;
      });
    }
    return { ok: true };
  }

  private identifierInputFor(identifier: string): RecordIdentityInput | null {
    const thread = this.rootStore.messagingThreadDetailStore.thread;
    if (!thread) return null;
    const participant = thread.participants.find((p) => p.identifier === identifier) ?? null;
    const raw = isHandleProvider(thread.provider) && participant?.profileUrl ? participant.profileUrl : identifier;
    const value = normalizeChannelValue(thread.provider, raw);
    if (!value) return null;
    return {
      provider: thread.provider,
      value,
      messagingId: isHandleProvider(thread.provider) ? identifier : undefined,
      displayName: participant?.displayName ?? undefined,
      profileUrl: participant?.profileUrl ?? undefined,
    };
  }

  private mutate = async (run: () => Promise<ActionOutcome>): Promise<void> => {
    runInAction(() => {
      this.pending = true;
    });
    let succeeded = false;
    try {
      const result = await run();
      succeeded = result.ok;
      if (succeeded && !this.pendingOperationId) await this.operationCompleted().catch(reportApplicationError);
    } catch {
      succeeded = false;
    } finally {
      runInAction(() => {
        this.pending = false;
        if (succeeded) {
          this.activeIdentifier = null;
          this.query = "";
          this.results = [];
        }
      });
      if (!succeeded) this.toastError("Inbox.participants.linkUpdateFailed");
    }
  };

  private reset() {
    this.activeIdentifier = null;
    this.query = "";
    this.results = [];
    this.createTypes = [];
    this.isLoading = false;
    this.searchError = false;
    this.searchGeneration += 1;
    this.debouncer.cancel();
  }

  private refresh = async (): Promise<void> => {
    if (this.activeIdentifier === null) return;
    const requestedIdentifier = this.activeIdentifier;
    const requestedQuery = this.query;
    const generation = ++this.searchGeneration;
    const isCurrent = () =>
      generation === this.searchGeneration &&
      this.activeIdentifier === requestedIdentifier &&
      this.query === requestedQuery;

    runInAction(() => {
      this.isLoading = true;
      this.searchError = false;
    });

    try {
      const result = await getIdentityRecordChoicesAction(requestedQuery);
      runInAction(() => {
        if (!isCurrent()) return;
        this.results = result.records;
        this.createTypes = result.createTypes;
        this.schemaRevision = result.schemaRevision;
      });
    } catch {
      runInAction(() => {
        if (isCurrent()) this.searchError = true;
      });
    } finally {
      runInAction(() => {
        if (isCurrent()) this.isLoading = false;
      });
    }
  };
}
