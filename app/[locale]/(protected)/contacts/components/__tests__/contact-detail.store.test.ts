import type { RootStore } from "@/core/stores/root.store";
import type { ContactDto } from "@/features/contacts/contact.schema";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessagingProvider } from "@/generated/prisma";

const contactActions = vi.hoisted(() => ({
  getContactByIdAction: vi.fn(),
  createContactAction: vi.fn(),
  updateContactAction: vi.fn(),
  deleteContactAction: vi.fn(),
}));

vi.mock("../../actions", () => contactActions);
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { ContactDetailStore } from "../contact-detail.store";

const CONTACT_ID = "40000000-0000-4000-8000-000000000001";
const TASK_ID = "50000000-0000-4000-8000-000000000001";

function stubRoot(): RootStore {
  return {
    registerModalStore: vi.fn(),
    contactsStore: {
      customColumns: [],
      setCustomColumns: vi.fn(),
      refreshCustomColumns: vi.fn().mockResolvedValue(undefined),
      upsertItem: vi.fn().mockResolvedValue(undefined),
      removeItem: vi.fn().mockResolvedValue(undefined),
    },
    loadingOverlayStore: { withLoading: (fn: () => unknown) => fn() },
    globalSearchModalStore: { pushRecentItem: vi.fn(), removeRecentItem: vi.fn() },
    activitiesStore: { refreshFor: vi.fn() },
    localeStore: { locale: "en", getTranslation: (key: string) => key },
  } as unknown as RootStore;
}

function makeStore(): ContactDetailStore {
  return new ContactDetailStore(stubRoot());
}

function contactWithTasks(): ContactDto {
  return {
    id: CONTACT_ID,
    firstName: "Existing",
    lastName: "Contact",
    notes: null,
    avatarUrl: null,
    customFieldValues: [],
    organizations: [],
    users: [],
    deals: [],
    tasks: [{ id: TASK_ID }],
    identifiers: [{ provider: MessagingProvider.mail, value: "existing@example.com" }],
  } as unknown as ContactDto;
}

const mail = (value: string) => ({ provider: MessagingProvider.mail, value });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ContactDetailStore.addChannel", () => {
  it("appends distinct channels in order", () => {
    const store = makeStore();
    store.addChannel(mail("a@example.com"));
    store.addChannel({ provider: MessagingProvider.whatsapp, value: "+4915150799170" });
    store.addChannel({ provider: MessagingProvider.linkedin, value: "jane-doe" });

    expect(store.channels.map((c) => c.value)).toEqual(["a@example.com", "+4915150799170", "jane-doe"]);
  });

  it("suppresses an exact repeat", () => {
    const store = makeStore();
    store.addChannel(mail("a@example.com"));
    store.addChannel(mail("a@example.com"));

    expect(store.channels).toHaveLength(1);
  });

  it("suppresses the same address under a sibling email provider", () => {
    const store = makeStore();
    store.addChannel(mail("a@example.com"));
    store.addChannel({ provider: MessagingProvider.google, value: "a@example.com" });

    expect(store.channels).toHaveLength(1);
    expect(store.channels[0].provider).toBe(MessagingProvider.mail);
  });

  it("does not suppress the same raw value across different channel classes", () => {
    const store = makeStore();
    store.addChannel({ provider: MessagingProvider.telegram, value: "jane" });
    store.addChannel({ provider: MessagingProvider.linkedin, value: "jane" });

    expect(store.channels).toHaveLength(2);
  });

  it("marks the form dirty when a channel is staged", () => {
    const store = makeStore();
    expect(store.hasUnsavedChanges).toBe(false);

    store.addChannel(mail("a@example.com"));
    expect(store.hasUnsavedChanges).toBe(true);
  });
});

describe("ContactDetailStore.removeChannel", () => {
  it("removes the channel at the given index", () => {
    const store = makeStore();
    store.addChannel(mail("a@example.com"));
    store.addChannel(mail("b@example.com"));
    store.addChannel(mail("c@example.com"));

    store.removeChannel(1);

    expect(store.channels.map((c) => c.value)).toEqual(["a@example.com", "c@example.com"]);
  });

  it("leaves the list untouched for an out-of-range index", () => {
    const store = makeStore();
    store.addChannel(mail("a@example.com"));

    store.removeChannel(5);

    expect(store.channels).toHaveLength(1);
  });
});

describe("ContactDetailStore create draft", () => {
  it("clears identifiers and taskIds carried over from a previously loaded contact", async () => {
    const store = makeStore();
    store.hydrate(contactWithTasks(), []);

    expect(store.form.taskIds).toEqual([TASK_ID]);
    expect(store.channels).toHaveLength(1);

    await store.add();

    expect(store.form.taskIds).toEqual([]);
    expect(store.channels).toEqual([]);
    expect(store.form.organizationIds).toEqual([]);
    expect(store.form.dealIds).toEqual([]);
    expect(store.form.userIds).toEqual([]);
    expect(store.form.id).toBeUndefined();
    expect(store.fetchedEntity).toBeNull();
  });

  it("starts clean so closing an untouched draft does not prompt", async () => {
    const store = makeStore();
    await store.add();

    expect(store.hasUnsavedChanges).toBe(false);
  });
});

describe("ContactDetailStore.onSubmit", () => {
  it("sends staged channels through a single create call", async () => {
    const store = makeStore();
    contactActions.createContactAction.mockResolvedValue({
      ok: true,
      data: { ...contactWithTasks(), id: CONTACT_ID },
    });

    await store.add();
    store.onChange("firstName", "Draft");
    store.addChannel(mail("a@example.com"));
    store.addChannel({ provider: MessagingProvider.linkedin, value: "jane-doe" });

    await store.onSubmit();

    expect(contactActions.createContactAction).toHaveBeenCalledTimes(1);
    expect(contactActions.updateContactAction).not.toHaveBeenCalled();

    const payload = contactActions.createContactAction.mock.calls[0][0];
    expect(payload.id).toBeUndefined();
    expect(payload.identifiers.map((i: { value: string }) => i.value)).toEqual(["a@example.com", "jane-doe"]);
  });

  it("sends an empty identifier list when no channel was staged", async () => {
    const store = makeStore();
    contactActions.createContactAction.mockResolvedValue({ ok: true, data: contactWithTasks() });

    await store.add();
    store.onChange("firstName", "Draft");
    await store.onSubmit();

    expect(contactActions.createContactAction.mock.calls[0][0].identifiers).toEqual([]);
  });

  it("keeps the draft recoverable when the create fails", async () => {
    const store = makeStore();
    contactActions.createContactAction.mockResolvedValue({ ok: false, error: { errors: ["boom"] } });

    await store.add();
    store.onChange("firstName", "Draft");
    store.addChannel(mail("a@example.com"));

    await store.onSubmit();

    expect(store.channels).toHaveLength(1);
    expect(store.form.firstName).toBe("Draft");
    expect(store.isOpen).toBe(true);
    expect(store.isLoading).toBe(false);
  });
});
