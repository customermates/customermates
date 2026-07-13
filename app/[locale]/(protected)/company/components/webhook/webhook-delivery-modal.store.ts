import type { RootStore } from "@/core/stores/root.store";
import type { WebhookDeliveryDto } from "@/features/webhook/get-webhook-deliveries.interactor";

import { makeObservable, action, observable } from "mobx";
import { Resource, WebhookDeliveryStatus } from "@/generated/prisma";

import { resendWebhookDeliveryAction } from "../../actions";

import { DomainEvent } from "@/features/event/domain-events";
import { BaseModalStore } from "@/core/base/base-modal.store";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

export class WebhookDeliveryModalStore extends BaseModalStore<WebhookDeliveryDto> {
  public isResending = false;

  constructor(rootStore: RootStore) {
    super(
      rootStore,
      {
        id: "",
        url: "",
        event: DomainEvent.CONTACT_CREATED,
        requestBody: {
          event: DomainEvent.CONTACT_CREATED,
          data: {} as WebhookDeliveryDto["requestBody"]["data"],
          timestamp: "",
        },
        statusCode: null,
        responseMessage: null,
        success: false,
        status: WebhookDeliveryStatus.pending,
        deliveredAt: null,
        createdAt: new Date(),
      },
      Resource.api,
    );

    makeObservable(this, {
      isResending: observable,
      resend: action,
    });
  }

  resend = async () => {
    if (!this.form.id) return;

    this.isResending = true;

    try {
      const res = await resendWebhookDeliveryAction({ id: this.form.id });
      if (!res.ok) {
        toastZodErrorTree(res.error);
        return;
      }

      await this.rootStore.webhookDeliveriesStore.refresh();
    } finally {
      this.isResending = false;
    }
  };
}
