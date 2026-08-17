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
const SECOND_CONTACT_ID = "40000000-0000-4000-8000-000000000002";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

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
    globalSearchModalStore: {
      pushRecentItem: vi.fn(),
      removeRecentItem: vi.fn(),
    },
    localeStore: { locale: "en", getTranslation: (key: string) => key },
  } as unknown as RootStore;
}

function makeStore(rootStore = stubRoot()): ContactDetailStore {
  return new ContactDetailStore(rootStore);
}

function makeStoreWithRoot(root: RootStore): ContactDetailStore {
  return new ContactDetailStore(root);
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

function contact(id: string, firstName: string): ContactDto {
  return {
    ...contactWithTasks(),
    id,
    firstName,
    tasks: [],
    identifiers: [],
  };
}

const mail = (value: string) => ({ provider: MessagingProvider.mail, value });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ContactDetailStore.addChannel", () => {
  it("appends distinct channels in order", () => {
    const store = makeStore();
    store.addChannel(mail("a@example.com"));
    store.addChannel({
      provider: MessagingProvider.whatsapp,
      value: "+4915150799170",
    });
    store.addChannel({
      provider: MessagingProvider.linkedin,
      value: "jane-doe",
    });

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
    store.addChannel({
      provider: MessagingProvider.google,
      value: "a@example.com",
    });

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

describe("ContactDetailStore.loadById", () => {
  it("ignores an older entity response that resolves after the current route", async () => {
    const first = deferred<{ entity: ContactDto | null; customColumns: [] }>();
    const second = deferred<{ entity: ContactDto | null; customColumns: [] }>();
    contactActions.getContactByIdAction.mockImplementation(({ id }: { id: string }) =>
      id === CONTACT_ID ? first.promise : second.promise,
    );
    const store = makeStore();

    const firstLoad = store.loadById(CONTACT_ID);
    const secondLoad = store.loadById(SECOND_CONTACT_ID);
    second.resolve({
      entity: contact(SECOND_CONTACT_ID, "Current"),
      customColumns: [],
    });
    await secondLoad;
    first.resolve({ entity: contact(CONTACT_ID, "Stale"), customColumns: [] });
    await firstLoad;

    expect(store.requestedEntityId).toBe(SECOND_CONTACT_ID);
    expect(store.fetchedEntity?.id).toBe(SECOND_CONTACT_ID);
    expect(store.form.firstName).toBe("Current");
    expect(store.entityLoadState).toBe("ready");
    expect(store.isLoading).toBe(false);
  });

  it("keeps the newer request loading when an older request settles first", async () => {
    const first = deferred<{ entity: ContactDto | null; customColumns: [] }>();
    const second = deferred<{ entity: ContactDto | null; customColumns: [] }>();
    contactActions.getContactByIdAction.mockImplementation(({ id }: { id: string }) =>
      id === CONTACT_ID ? first.promise : second.promise,
    );
    const store = makeStore();

    const firstLoad = store.loadById(CONTACT_ID);
    const secondLoad = store.loadById(SECOND_CONTACT_ID);
    first.resolve({ entity: contact(CONTACT_ID, "Stale"), customColumns: [] });
    await firstLoad;

    expect(store.fetchedEntity).toBeNull();
    expect(store.entityLoadState).toBe("loading");
    expect(store.isLoading).toBe(true);

    second.resolve({
      entity: contact(SECOND_CONTACT_ID, "Current"),
      customColumns: [],
    });
    await secondLoad;

    expect(store.fetchedEntity?.id).toBe(SECOND_CONTACT_ID);
    expect(store.form.firstName).toBe("Current");
    expect(store.entityLoadState).toBe("ready");
  });

  it("does not hydrate a pending detail request into a new-contact draft", async () => {
    const pending = deferred<{
      entity: ContactDto | null;
      customColumns: [];
    }>();
    contactActions.getContactByIdAction.mockReturnValue(pending.promise);
    const store = makeStore();

    const load = store.loadById(CONTACT_ID);
    await store.add();

    expect(store.isLoading).toBe(false);

    pending.resolve({
      entity: contact(CONTACT_ID, "Stale"),
      customColumns: [],
    });
    await load;

    expect(store.requestedEntityId).toBeNull();
    expect(store.entityLoadState).toBe("idle");
    expect(store.fetchedEntity).toBeNull();
    expect(store.form.id).toBeUndefined();
    expect(store.form.firstName).toBe("");
    expect(store.isOpen).toBe(true);
    expect(store.isLoading).toBe(false);
  });

  it("does not let an older add preparation overwrite a newer entity load", async () => {
    const customColumnsRefresh = deferred<undefined>();
    const root = stubRoot();
    vi.mocked(root.contactsStore.refreshCustomColumns).mockReturnValue(customColumnsRefresh.promise);
    contactActions.getContactByIdAction.mockResolvedValue({
      entity: contact(SECOND_CONTACT_ID, "Current"),
      customColumns: [],
    });
    const store = makeStoreWithRoot(root);

    const add = store.add();
    const load = store.loadById(SECOND_CONTACT_ID);
    await load;
    customColumnsRefresh.resolve(undefined);

    expect(await add).toBe(false);
    expect(store.fetchedEntity?.id).toBe(SECOND_CONTACT_ID);
    expect(store.form.firstName).toBe("Current");
    expect(store.isOpen).toBe(false);
  });
});

describe("ContactDetailStore.onSubmit", () => {
  it("sends staged channels through a single create call", async () => {
    const rootStore = stubRoot();
    const store = makeStore(rootStore);
    contactActions.createContactAction.mockResolvedValue({
      ok: true,
      data: { ...contactWithTasks(), id: CONTACT_ID },
    });

    await store.add();
    store.onChange("firstName", "Draft");
    store.addChannel(mail("a@example.com"));
    store.addChannel({
      provider: MessagingProvider.linkedin,
      value: "jane-doe",
    });

    await store.onSubmit();

    expect(contactActions.createContactAction).toHaveBeenCalledTimes(1);
    expect(contactActions.updateContactAction).not.toHaveBeenCalled();

    const payload = contactActions.createContactAction.mock.calls[0][0];
    expect(payload.id).toBeUndefined();
    expect(payload.identifiers.map((i: { value: string }) => i.value)).toEqual(["a@example.com", "jane-doe"]);
    expect(rootStore.contactsStore.upsertItem).toHaveBeenCalledWith(expect.objectContaining({ id: CONTACT_ID }));
  });

  it("sends an empty identifier list when no channel was staged", async () => {
    const store = makeStore();
    contactActions.createContactAction.mockResolvedValue({
      ok: true,
      data: contactWithTasks(),
    });

    await store.add();
    store.onChange("firstName", "Draft");
    await store.onSubmit();

    expect(contactActions.createContactAction.mock.calls[0][0].identifiers).toEqual([]);
  });

  it("keeps the draft recoverable when the create fails", async () => {
    const store = makeStore();
    contactActions.createContactAction.mockResolvedValue({
      ok: false,
      error: { errors: ["boom"] },
    });

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
