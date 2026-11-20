import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type {
  IncomingWebhookDto,
  IncomingWebhookPreview,
  IncomingWebhookResult,
} from "@/features/incoming-webhook/incoming-webhook.schema";

import { action, computed, makeObservable, observable, runInAction } from "mobx";

import { Resource } from "@/generated/prisma";

import { manageIncomingWebhookAction } from "./incoming-webhook-actions";
import {
  type IncomingWebhookForm,
  EMPTY_MAPPING_ROW,
  emptyForm,
  formOf,
  parseSample,
  saveRequest,
} from "./incoming-webhook-form";

import { BaseModalStore } from "@/core/base/base-modal.store";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

export type IncomingWebhookField = NonNullable<IncomingWebhookResult["fields"]>[number];

export type IncomingWebhookList = { id: string; label: string };

export class IncomingWebhookModalStore extends BaseModalStore<IncomingWebhookForm> {
  lists: IncomingWebhookList[] = [];
  fields: IncomingWebhookField[] = [];
  preview: IncomingWebhookPreview | null = null;
  url: string | null = null;
  private fieldsRequest = 0;

  constructor(rootStore: RootStore) {
    super(rootStore, emptyForm(""), Resource.api);

    makeObservable(this, {
      lists: observable.ref,
      fields: observable.ref,
      preview: observable.ref,
      url: observable,
      request: computed,
      mapped: computed,
      sampleInvalid: computed,
      canTest: computed,
      configure: action,
      start: action,
      addRow: action,
      removeRow: action,
      loadFields: action,
      onSubmit: action,
      test: action,
      rotate: action,
    });
  }

  configure = (lists: IncomingWebhookList[]) => {
    this.lists = lists;
  };

  get request() {
    return saveRequest(this.form);
  }

  get mapped() {
    return this.form.rows
      .filter((row) => row.fieldId)
      .map((row) => ({ value: row.fieldId, label: row.path || row.fieldId }));
  }

  get sampleInvalid() {
    return !parseSample(this.form.sample).ok;
  }

  get canTest() {
    return !this.isLoading && this.request !== null && !this.sampleInvalid && this.form.sample.trim().length > 0;
  }

  start = (webhook?: IncomingWebhookDto) => {
    this.preview = null;
    this.url = webhook?.url ?? null;
    this.onInitOrRefresh(webhook ? formOf(webhook) : emptyForm(this.lists[0]?.id ?? ""));
    this.open();
  };

  addRow = () => {
    this.onChange("rows", [...this.form.rows, { ...EMPTY_MAPPING_ROW }]);
  };

  removeRow = (index: number) => {
    this.onChange(
      "rows",
      this.form.rows.filter((_, position) => position !== index),
    );
  };

  protected override afterChange(id: string, value: unknown, previous: unknown) {
    if (id !== "typeId" || value === previous) return;
    this.form.rows = [{ ...EMPTY_MAPPING_ROW }];
    this.form.matchFieldId = "";
  }

  loadFields = async () => {
    const { typeId } = this.form;
    const request = ++this.fieldsRequest;
    if (!typeId) return;
    const result = await manageIncomingWebhookAction({ action: "fields", typeId });
    if (request !== this.fieldsRequest) return;
    if (result.ok) runInAction(() => (this.fields = result.data.fields ?? []));
    else toastZodErrorTree(result.error);
  };

  protected override prepareToClose(): boolean {
    return !this.isLoading;
  }

  private save = async (): Promise<IncomingWebhookDto | null> => {
    const { request } = this;
    if (!request) return null;
    const result = await manageIncomingWebhookAction(request);
    if (!result.ok) {
      this.setError(result.error as never);
      return null;
    }
    const webhook = result.data.webhook ?? null;
    if (webhook) {
      const created = !this.form.id;
      const { sample } = this.form;
      runInAction(() => {
        this.url = webhook.url;
        this.onInitOrRefresh({ ...formOf(webhook), sample });
      });
      await this.rootStore.incomingWebhooksStore.upsertItem(webhook, { created });
    }
    return webhook;
  };

  private run = async (work: () => Promise<void>) => {
    if (this.isLoading) return;
    this.setIsLoading(true);
    try {
      await work();
    } finally {
      this.setIsLoading(false);
    }
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    await this.run(async () => {
      if (await this.save()) this.toastSuccess("IncomingWebhooks.saved");
    });
  };

  test = () =>
    this.run(async () => {
      const webhook = await this.save();
      const sample = parseSample(this.form.sample);
      if (!webhook || !sample.ok || !sample.value) return;
      const result = await manageIncomingWebhookAction({
        action: "test",
        id: webhook.id,
        payload: sample.value as never,
      });
      if (result.ok) runInAction(() => (this.preview = result.data.preview ?? null));
      else toastZodErrorTree(result.error);
    });

  rotate = () =>
    this.run(async () => {
      if (!this.form.id) return;
      const result = await manageIncomingWebhookAction({ action: "update", id: this.form.id, rotateUrl: true });
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }
      const webhook = result.data.webhook;
      if (webhook) {
        runInAction(() => (this.url = webhook.url));
        await this.rootStore.incomingWebhooksStore.upsertItem(webhook, { created: false });
      }
      this.toastSuccess("IncomingWebhooks.rotated");
    });

  deleteById = async (id: string): Promise<boolean> => {
    const result = await manageIncomingWebhookAction({ action: "delete", id });
    if (!result.ok) {
      toastZodErrorTree(result.error);
      return false;
    }
    await this.rootStore.incomingWebhooksStore.removeItem(id);
    this.toastSuccess("IncomingWebhooks.deleted");
    return true;
  };
}
