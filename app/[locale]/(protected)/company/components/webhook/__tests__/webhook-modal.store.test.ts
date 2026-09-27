import type { RootStore } from "@/core/stores/root.store";

import { beforeEach, describe, expect, it, vi } from "vitest";

const companyActions = vi.hoisted(() => ({
  deleteWebhookAction: vi.fn(),
  upsertWebhookAction: vi.fn(),
}));

vi.mock("../../../actions", () => companyActions);

import { WebhookModalStore } from "../webhook-modal.store";

const NEW_WEBHOOK = {
  url: "",
  description: undefined,
  events: [],
  secret: undefined,
  headers: "",
  bodyTemplate: undefined,
  enabled: true,
};

const SAVED_WEBHOOK = {
  id: "30000000-0000-4000-8000-000000000001",
  url: "https://hooks.example.com/customermates",
  description: undefined,
  events: ["contact.created" as const],
  secret: "saved-secret",
  headers: "",
  bodyTemplate: '{"text": "{{event}}"}',
  enabled: true,
};

function makeStore() {
  const rootStore = {
    registerModalStore: vi.fn(),
    webhooksStore: { upsertItem: vi.fn(), removeItem: vi.fn() },
  } as unknown as RootStore;

  return new WebhookModalStore(rootStore);
}

function submittedPayload() {
  return companyActions.upsertWebhookAction.mock.calls.at(-1)?.[0] as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  companyActions.upsertWebhookAction.mockResolvedValue({ ok: true, data: { id: SAVED_WEBHOOK.id } });
});

describe("WebhookModalStore submit", () => {
  it("saves a new webhook without a secret or template after they were typed into and cleared", async () => {
    const store = makeStore();
    store.openWith(NEW_WEBHOOK);
    store.onChange("url", "https://hooks.example.com/new");
    store.onChange("events", ["contact.created"]);
    store.onChange("secret", "abc");
    store.onChange("secret", "");
    store.onChange("bodyTemplate", '{"a": 1}');
    store.onChange("bodyTemplate", "  ");

    await store.onSubmit();

    const payload = submittedPayload();
    expect(payload).toMatchObject({ url: "https://hooks.example.com/new", events: ["contact.created"] });
    expect(payload.secret).toBeUndefined();
    expect(payload.bodyTemplate).toBeUndefined();
    expect(store.isOpen).toBe(false);
  });

  it("keeps sending a typed secret and template unchanged", async () => {
    const store = makeStore();
    store.openWith(NEW_WEBHOOK);
    store.onChange("secret", "abc");
    store.onChange("bodyTemplate", '{"a": 1}');

    await store.onSubmit();

    expect(submittedPayload()).toMatchObject({ secret: "abc", bodyTemplate: '{"a": 1}' });
  });

  it("still sends an emptied saved secret or template, which the dialog cannot remove", async () => {
    const store = makeStore();
    store.openWith(SAVED_WEBHOOK);
    store.onChange("secret", "");
    store.onChange("bodyTemplate", "");

    await store.onSubmit();

    expect(submittedPayload()).toMatchObject({ id: SAVED_WEBHOOK.id, secret: "", bodyTemplate: "" });
  });
});
