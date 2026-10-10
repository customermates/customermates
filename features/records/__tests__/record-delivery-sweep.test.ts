import { describe, expect, it, vi } from "vitest";
import type { EventOutboxRepo } from "@/features/event/event-outbox.repo";
import type { RecordOperationQueueRepo } from "../record-operation-queue.repo";
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
      { dueCompaniesUnscoped } as unknown as EventOutboxRepo,
      { dueUnscoped } as unknown as WebhookDeliveryQueueRepo,
      { claimDueUnscoped: vi.fn().mockResolvedValue([]) } as unknown as RecordOperationQueueRepo,
      { dispatch },
    );

    await expect(sweep.invoke()).resolves.toEqual({ eventWorkspaces: 1, webhookDeliveries: 1, recordOperations: 0 });
    expect(dispatch).toHaveBeenCalledWith("process-events", {
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
      } as unknown as EventOutboxRepo,
      {
        dueUnscoped: vi.fn().mockResolvedValue([
          {
            companyId: "6a61ad3a-df22-43db-9a09-c77b582cbfee",
            deliveryId: "15d4c3e0-cf7b-4d77-8eb4-2ca820efb5e1",
          },
        ]),
      } as unknown as WebhookDeliveryQueueRepo,
      { claimDueUnscoped: vi.fn().mockResolvedValue([]) } as unknown as RecordOperationQueueRepo,
      { dispatch },
    );

    await expect(sweep.invoke()).rejects.toThrow("next sweep will retry");
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it("retries a failed start using the stored workspace and owner, without claiming a live lease", async () => {
    const operation = {
      companyId: "6a61ad3a-df22-43db-9a09-c77b582cbfee",
      operationId: "8f1f44a8-67a5-4262-a57c-f6bc1155a231",
      ownerUserId: "79d62254-a527-4959-b02e-d92bab92945b",
      kind: "mutation" as const,
    };
    const claimDueUnscoped = vi
      .fn()
      .mockResolvedValueOnce([operation])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([operation]);
    const dispatch = vi.fn().mockRejectedValueOnce(new Error("Workflow unavailable")).mockResolvedValue(undefined);
    const sweep = new SweepRecordDeliveriesInteractor(
      { dueCompaniesUnscoped: vi.fn().mockResolvedValue([]) } as unknown as EventOutboxRepo,
      { dueUnscoped: vi.fn().mockResolvedValue([]) } as unknown as WebhookDeliveryQueueRepo,
      { claimDueUnscoped } as unknown as RecordOperationQueueRepo,
      { dispatch },
    );
    await expect(sweep.invoke()).rejects.toThrow("next sweep will retry");
    await expect(sweep.invoke()).resolves.toMatchObject({ recordOperations: 0 });
    await expect(sweep.invoke()).resolves.toMatchObject({ recordOperations: 1 });
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenNthCalledWith(2, "record-operation", {
      operationId: operation.operationId,
      ownerUserId: operation.ownerUserId,
      tenant: { companyId: operation.companyId, userId: operation.ownerUserId },
    });
  });

  it("routes avatar work without forging a user tenant", async () => {
    const dispatch = vi.fn().mockResolvedValue(undefined);
    const companyId = "6a61ad3a-df22-43db-9a09-c77b582cbfee";
    const operationId = "8f1f44a8-67a5-4262-a57c-f6bc1155a231";
    const sweep = new SweepRecordDeliveriesInteractor(
      { dueCompaniesUnscoped: vi.fn().mockResolvedValue([]) } as unknown as EventOutboxRepo,
      { dueUnscoped: vi.fn().mockResolvedValue([]) } as unknown as WebhookDeliveryQueueRepo,
      {
        claimDueUnscoped: vi
          .fn()
          .mockResolvedValue([{ companyId, operationId, ownerUserId: "system:messaging", kind: "provider-avatar" }]),
      } as unknown as RecordOperationQueueRepo,
      { dispatch },
    );
    await expect(sweep.invoke()).resolves.toMatchObject({ recordOperations: 1 });
    expect(dispatch).toHaveBeenCalledWith("provider-avatar-operation", { companyId, operationId });
  });
});
