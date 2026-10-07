import type { RecordModel } from "@/features/records/record-model.schema";
import { getRecordModelAction } from "@/app/[locale]/(protected)/records/actions";
import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { UpsertWebhookData } from "@/features/webhook/upsert-webhook.interactor";
import type { WebhookDto } from "@/features/webhook/webhook.schema";

import { action, computed, makeObservable, observable, override, runInAction, toJS } from "mobx";
import { Resource } from "@/generated/prisma";
import { z } from "zod";

import { deleteWebhookAction, upsertWebhookAction } from "../../actions";

import { BaseModalStore } from "@/core/base/base-modal.store";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { parseWebhookHeaderLines } from "@/features/webhook/webhook-headers";
import { WebhookCurrentEventSchema } from "@/features/webhook/webhook.schema";

export type WebhookFormData = Omit<UpsertWebhookData, "headers" | "events"> & {
  headers?: string;
  events?: WebhookDto["events"];
};

export class WebhookModalStore extends BaseModalStore<WebhookFormData> {
  showSecret = false;
  recordModel: RecordModel | null = null;
  modelLoading = false;
  modelLoadFailed = false;
  private modelRequest = 0;

  constructor(rootStore: RootStore) {
    super(
      rootStore,
      {
        url: "",
        description: undefined,
        events: [],
        secret: undefined,
        headers: "",
        bodyTemplate: undefined,
        enabled: true,
      },
      Resource.api,
    );

    makeObservable(this, {
      showSecret: observable,
      recordModel: observable.ref,
      modelLoading: observable,
      modelLoadFailed: observable,
      usesRecordTrigger: computed,
      watchesRecordChanges: computed,
      ownsRecordAccess: computed,
      canManage: override,
      isReadOnly: override,
      isDisabled: override,
      loadRecordModel: action,
      cancelModelLoad: action,

      delete: action,
      onSubmit: action,
      toggleShowSecret: action,
    });
  }

  get usesRecordTrigger() {
    return this.form.events?.some((event) => event.startsWith("record.")) ?? false;
  }

  get watchesRecordChanges() {
    return this.form.events?.includes("record.updated") ?? false;
  }

  get ownsRecordAccess() {
    const user = this.rootStore.userStore.user;
    return (
      !this.savedState.recordOwnerUserId ||
      this.savedState.recordOwnerUserId === user?.id ||
      Boolean(user?.role?.isSystemRole)
    );
  }

  override get canManage() {
    return super.canManage && this.ownsRecordAccess;
  }

  override get isReadOnly() {
    return !this.canManage;
  }

  override get isDisabled() {
    return super.isDisabled || (this.usesRecordTrigger && (!this.recordModel || this.modelLoading));
  }

  protected override afterChange(id: string, value: unknown, previous: unknown) {
    if (id === "recordTrigger.query.typeId" && value !== previous && this.form.recordTrigger) {
      this.form.recordTrigger = {
        query: { typeId: String(value), filters: [], relationships: [] },
        changedFieldIds: [],
      };
    }
    if (id !== "events") return;
    if (!this.usesRecordTrigger) {
      this.form.recordTrigger = null;
      this.form.recordSources = null;
      this.form.recordOwnerUserId = undefined;
    } else if (
      !this.form.recordSources?.length &&
      (!Array.isArray(previous) || !previous.some((event) => String(event).startsWith("record.")))
    ) {
      const type = this.recordModel?.types.find((type) => !type.archived);
      if (type)
        this.form.recordTrigger = { query: { typeId: type.id, filters: [], relationships: [] }, changedFieldIds: [] };
    }
  }

  cancelModelLoad = () => {
    this.modelRequest += 1;
    this.modelLoading = false;
  };

  loadRecordModel = async () => {
    const request = ++this.modelRequest;
    this.recordModel = null;
    this.modelLoading = true;
    this.modelLoadFailed = false;
    try {
      const model = await getRecordModelAction();
      if (request !== this.modelRequest) return;
      runInAction(() => {
        this.recordModel = model;
      });
    } catch {
      if (request === this.modelRequest) {
        runInAction(() => {
          this.modelLoadFailed = true;
        });
      }
    } finally {
      if (request === this.modelRequest) {
        runInAction(() => {
          this.modelLoading = false;
        });
      }
    }
  };

  toggleShowSecret = () => {
    this.showSecret = !this.showSecret;
  };

  delete = async (): Promise<boolean> => {
    if (!this.form.id) return false;

    this.setIsLoading(true);

    try {
      const res = await deleteWebhookAction({ id: this.form.id });
      if (!res.ok) {
        toastZodErrorTree(res.error);
        return false;
      }

      await this.rootStore.webhooksStore.removeItem(res.data);
      this.close();
      return true;
    } finally {
      this.setIsLoading(false);
    }
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (this.usesRecordTrigger && (!this.recordModel || this.modelLoading)) return;
    this.setIsLoading(true);

    try {
      const { headers, secret, bodyTemplate, ...form } = toJS(this.form);
      const events = z.object({ events: z.array(WebhookCurrentEventSchema) }).safeParse({ events: form.events });
      if (!events.success) {
        this.setError(z.treeifyError(events.error));
        return;
      }
      const parsed = parseWebhookHeaderLines(headers ?? "");
      const res = await upsertWebhookAction({
        ...form,
        events: events.data.events,
        recordTrigger:
          this.usesRecordTrigger && form.recordSources?.length
            ? undefined
            : this.usesRecordTrigger
              ? (form.recordTrigger ?? null)
              : null,
        recordSources: this.usesRecordTrigger ? form.recordSources : null,
        recordOwnerUserId: this.usesRecordTrigger ? form.recordOwnerUserId : undefined,
        expectedSchemaRevision: this.usesRecordTrigger ? this.recordModel?.revision : undefined,
        secret: secret === "" && !this.savedState.secret ? undefined : secret,
        bodyTemplate: !bodyTemplate?.trim() && !this.savedState.bodyTemplate ? undefined : bodyTemplate,
        headers: Object.keys(parsed).length > 0 ? parsed : null,
      });

      if (res.ok) {
        await this.rootStore.webhooksStore.upsertItem(res.data, { created: !form.id });
        this.close();
      } else this.setError(res.error);
    } finally {
      this.setIsLoading(false);
    }
  };
}
