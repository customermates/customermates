import { beforeEach, describe, expect, it, vi } from "vitest";
import { createZodError } from "@/core/validation/validation.utils";

const mocks = vi.hoisted(() => ({ link: vi.fn(), unlink: vi.fn() }));
vi.mock("@/core/di", () => ({
  getLinkContactIdentifierInteractor: () => ({ invoke: mocks.link }),
  getUnlinkContactIdentifierInteractor: () => ({ invoke: mocks.unlink }),
}));
import { linkContactToThreadAction, unlinkContactFromThreadAction } from "../actions";

describe("inbox contact-link action adapters", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each(["link", "unlink"] as const)("forwards the complete %s command to its interactor", async (operation) => {
    const input = {
      contactId: "10000000-0000-4000-8000-000000000001",
      provider: "mail" as const,
      identifier: "ada@example.com",
    };
    const data = { id: input.contactId };
    mocks[operation].mockResolvedValue({ ok: true, data });
    const action = operation === "link" ? linkContactToThreadAction : unlinkContactFromThreadAction;
    await expect(action(input)).resolves.toEqual({ ok: true, data });
    expect(mocks[operation]).toHaveBeenCalledExactlyOnceWith(input);
  });

  it("serializes the localized missing-contact error", async () => {
    mocks.link.mockResolvedValue({ ok: false, error: createZodError("Contact not found", ["contactId"]) });
    await expect(
      linkContactToThreadAction({
        contactId: "10000000-0000-4000-8000-000000000001",
        provider: "mail",
        identifier: "ada@example.com",
      }),
    ).resolves.toEqual({
      ok: false,
      error: { errors: [], properties: { contactId: { errors: ["Contact not found"] } } },
    });
  });
});
