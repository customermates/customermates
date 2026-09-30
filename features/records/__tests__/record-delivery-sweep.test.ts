import { describe, expect, it, vi } from "vitest";
import type { RecordEventOutboxRepo } from "../record-event-outbox.repo";
import type { WebhookDeliveryQueueRepo } from "@/features/webhook/webhook-delivery-queue.repo";
import { SweepRecordDeliveriesInteractor } from "../sweep-record-deliveries.interactor";

vi.mock("@/env", () => ({ env: { APP_MODE: "cloud" } }));

describe("record delivery recovery sweep", () => {
  it("restarts due event admissions and webhook deliveries without replaying unrelated work", async () => {
    const dueCompaniesUnscoped = vi.fn().mockResolvedValue(["6a61ad3a-df22-43db-9a09-c77b582cbfee"]);
    const dueUnscoped = vi.fn().mockResolvedValue([
      {
        companyId: "6a61ad3a-df22-43db-9a09-c77b582cbfee",
        deliveryId: "15d4c3e0-cf7b-4d77-8eb4-2ca820efb5e1",
      },
    ]);
    const dispatch = vi.fn().mockResolvedValue(undefined);
    const sweep = new SweepRecordDeliveriesInteractor(
      { dueCompaniesUnscoped } as unknown as RecordEventOutboxRepo,
      { dueUnscoped } as unknown as WebhookDeliveryQueueRepo,
      { dispatch },
    );

    await expect(sweep.invoke()).resolves.toEqual({ eventWorkspaces: 1, webhookDeliveries: 1 });
    expect(dispatch).toHaveBeenCalledWith("process-record-events", {
      companyId: "6a61ad3a-df22-43db-9a09-c77b582cbfee",
    });
    expect(dispatch).toHaveBeenCalledWith("deliver-webhook", {
      companyId: "6a61ad3a-df22-43db-9a09-c77b582cbfee",
      deliveryId: "15d4c3e0-cf7b-4d77-8eb4-2ca820efb5e1",
    });
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it("surfaces start failures after attempting the other due work", async () => {
    const dispatch = vi.fn().mockRejectedValueOnce(new Error("Workflow unavailable")).mockResolvedValueOnce(undefined);
    const sweep = new SweepRecordDeliveriesInteractor(
      {
        dueCompaniesUnscoped: vi.fn().mockResolvedValue(["6a61ad3a-df22-43db-9a09-c77b582cbfee"]),
      } as unknown as RecordEventOutboxRepo,
      {
        dueUnscoped: vi.fn().mockResolvedValue([
          {
            companyId: "6a61ad3a-df22-43db-9a09-c77b582cbfee",
            deliveryId: "15d4c3e0-cf7b-4d77-8eb4-2ca820efb5e1",
          },
        ]),
      } as unknown as WebhookDeliveryQueueRepo,
      { dispatch },
    );

    await expect(sweep.invoke()).rejects.toThrow("next sweep will retry");
    expect(dispatch).toHaveBeenCalledTimes(2);
  });
});
