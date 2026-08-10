import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock("sonner", () => ({ toast }));

import { toastZodErrorTree } from "../toast-zod-error-tree";

beforeEach(() => vi.clearAllMocks());

describe("toastZodErrorTree", () => {
  it("shows localized messages without synthesizing English field names", () => {
    const result = toastZodErrorTree({
      properties: {
        confirmEmail: { errors: ["Die E-Mail-Adressen stimmen nicht überein."] },
      },
    });

    expect(result).toBe(true);
    expect(toast.error).toHaveBeenCalledWith("Die E-Mail-Adressen stimmen nicht überein.");
    expect(toast.error).not.toHaveBeenCalledWith(expect.stringContaining("Confirm Email"));
  });

  it("walks nested arrays and renders each distinct localized message", () => {
    toastZodErrorTree({
      properties: {
        contacts: {
          items: [
            { properties: { email: { errors: ["Adresse e-mail invalide"] } } },
            { properties: { email: { errors: ["Ce champ est obligatoire"] } } },
          ],
        },
      },
    });

    const rendered = renderToStaticMarkup(toast.error.mock.calls[0][0]);
    expect(rendered).toContain("Adresse e-mail invalide");
    expect(rendered).toContain("Ce champ est obligatoire");
    expect(rendered).not.toContain("Contacts");
    expect(rendered).not.toContain("Email");
  });

  it("deduplicates the same message emitted on multiple paths", () => {
    toastZodErrorTree({
      properties: {
        firstName: { errors: ["Dieses Feld ist erforderlich."] },
        lastName: { errors: ["Dieses Feld ist erforderlich."] },
      },
    });

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith("Dieses Feld ist erforderlich.");
  });

  it("returns false for an empty tree", () => {
    expect(toastZodErrorTree({})).toBe(false);
    expect(toast.error).not.toHaveBeenCalled();
  });
});
