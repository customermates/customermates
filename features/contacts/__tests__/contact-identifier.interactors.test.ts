import type { ContactDto, ContactIdentifierDto } from "../contact.schema";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/core/errors/app-errors";
import { createZodError } from "@/core/validation/validation.utils";
import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

let mockUser = createMockUser();
vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({ getTranslations: () => Promise.resolve({ raw: (key: string) => key }) }));

import { LinkContactIdentifierInteractor } from "../upsert/link-contact-identifier.interactor";
import { UnlinkContactIdentifierInteractor } from "../upsert/unlink-contact-identifier.interactor";

const contactId = "10000000-0000-4000-8000-000000000001";
function identifier(overrides: Partial<ContactIdentifierDto> = {}): ContactIdentifierDto {
  return {
    id: "10000000-0000-4000-8000-000000000002",
    provider: "google",
    value: "ada@example.com",
    messagingId: null,
    displayName: null,
    profileUrl: null,
    ...overrides,
  };
}
function contact(identifiers: ContactIdentifierDto[] = []): ContactDto {
  return {
    id: contactId,
    firstName: "Ada",
    lastName: "Example",
    avatarUrl: null,
    notes: null,
    identifiers,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    organizations: [],
    users: [],
    deals: [],
    tasks: [],
    customFieldValues: [],
  };
}

const getContact = { invoke: vi.fn() };
const updateContact = { invoke: vi.fn() };
function operation(kind: "link" | "unlink") {
  return kind === "link"
    ? new LinkContactIdentifierInteractor(getContact as never, updateContact as never)
    : new UnlinkContactIdentifierInteractor(getContact as never, updateContact as never);
}

describe("contact identifier interactors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = createMockUser();
    getContact.invoke.mockResolvedValue({ ok: true, data: { contact: contact(), customColumns: [] } });
    updateContact.invoke.mockResolvedValue({ ok: true, data: contact() });
  });

  it("replaces an equivalent email channel and preserves unrelated identifier metadata", async () => {
    getContact.invoke.mockResolvedValue({
      ok: true,
      data: {
        contact: contact([
          identifier(),
          identifier({
            provider: "instagram",
            value: "ada",
            messagingId: "opaque-id",
            displayName: "Ada Example",
            profileUrl: "https://www.instagram.com/ada",
          }),
        ]),
        customColumns: [],
      },
    });
    const result = await operation("link").invoke({
      contactId,
      provider: "outlook",
      identifier: "ada@example.com",
      displayName: "Ada",
    });
    expect(result.ok).toBe(true);
    expect(updateContact.invoke).toHaveBeenCalledWith({
      id: contactId,
      identifiers: [
        {
          provider: "instagram",
          value: "ada",
          messagingId: "opaque-id",
          displayName: "Ada Example",
          profileUrl: "https://www.instagram.com/ada",
        },
        {
          provider: "outlook",
          value: "ada@example.com",
          messagingId: undefined,
          displayName: "Ada",
          profileUrl: undefined,
        },
      ],
    });
  });

  it("replaces an existing handle matched by messagingId", async () => {
    getContact.invoke.mockResolvedValue({
      ok: true,
      data: {
        contact: contact([identifier({ provider: "instagram", value: "ada", messagingId: "opaque-id" })]),
        customColumns: [],
      },
    });
    await operation("link").invoke({ contactId, provider: "instagram", identifier: "opaque-id" });
    expect(updateContact.invoke).toHaveBeenCalledWith({
      id: contactId,
      identifiers: [
        {
          provider: "instagram",
          value: "opaque-id",
          messagingId: "opaque-id",
          displayName: undefined,
          profileUrl: undefined,
        },
      ],
    });
  });

  it("unlinks the equivalent email channel without removing another provider", async () => {
    getContact.invoke.mockResolvedValue({
      ok: true,
      data: {
        contact: contact([identifier(), identifier({ provider: "instagram", value: "ada", messagingId: "opaque-id" })]),
        customColumns: [],
      },
    });
    await operation("unlink").invoke({ contactId, provider: "mail", identifier: "ada@example.com" });
    expect(updateContact.invoke).toHaveBeenCalledWith({
      id: contactId,
      identifiers: [
        {
          provider: "instagram",
          value: "ada",
          messagingId: "opaque-id",
          displayName: undefined,
          profileUrl: undefined,
        },
      ],
    });
  });

  it.each(["link", "unlink"] as const)("returns a localized not-found failure for %s", async (kind) => {
    getContact.invoke.mockResolvedValue({ ok: true, data: { contact: null, customColumns: [] } });
    const result = await operation(kind).invoke({ contactId, provider: "mail", identifier: "ada@example.com" });
    expect(result).toMatchObject({
      ok: false,
      error: { issues: [{ path: ["contactId"], params: { error: "contactNotFound", kind: "not_found" } }] },
    });
    expect(updateContact.invoke).not.toHaveBeenCalled();
  });

  it.each(["link", "unlink"] as const)("preserves a scoped read failure for %s", async (kind) => {
    const failure = { ok: false, error: createZodError("Unavailable") };
    getContact.invoke.mockResolvedValue(failure);
    await expect(
      operation(kind).invoke({ contactId, provider: "mail", identifier: "ada@example.com" }),
    ).resolves.toEqual(failure);
    expect(updateContact.invoke).not.toHaveBeenCalled();
  });

  it.each(["link", "unlink"] as const)("rejects malformed input before reading for %s", async (kind) => {
    const result = await operation(kind).invoke({ contactId, provider: "mail", identifier: "" });
    expect(result.ok).toBe(false);
    expect(getContact.invoke).not.toHaveBeenCalled();
    expect(updateContact.invoke).not.toHaveBeenCalled();
  });

  it.each(["link", "unlink"] as const)("requires update permission for %s", async (kind) => {
    mockUser = createMockUserWithPermissions([]);
    await expect(
      operation(kind).invoke({ contactId, provider: "mail", identifier: "ada@example.com" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(getContact.invoke).not.toHaveBeenCalled();
    expect(updateContact.invoke).not.toHaveBeenCalled();
  });

  it("preserves update failures", async () => {
    const failure = { ok: false, error: createZodError("Already linked", ["identifiers"]) };
    updateContact.invoke.mockResolvedValue(failure);
    await expect(
      operation("link").invoke({ contactId, provider: "mail", identifier: "ada@example.com" }),
    ).resolves.toEqual(failure);
  });
});
