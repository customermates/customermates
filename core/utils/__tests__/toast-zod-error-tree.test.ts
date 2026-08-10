import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const toast = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock("sonner", () => ({ toast }));

import { toastZodErrorTree } from "../toast-zod-error-tree";

beforeEach(() => vi.clearAllMocks());

describe("toastZodErrorTree", () => {
  it("shows localized messages without synthesizing English field names", () => {
    const tree = z.treeifyError(
      new z.ZodError([
        {
          code: "custom",
          message: "Die E-Mail-Adressen stimmen nicht überein.",
          path: ["confirmEmail"],
        },
      ]),
    );
    const result = toastZodErrorTree(tree);

    expect(result).toBe(true);
    expect(toast.error).toHaveBeenCalledWith("Die E-Mail-Adressen stimmen nicht überein.");
    expect(toast.error).not.toHaveBeenCalledWith(expect.stringContaining("Confirm Email"));
    expect(toast.error).not.toHaveBeenCalledWith(expect.stringContaining("confirmEmail"));
  });

  it("walks nested arrays and renders each distinct localized message", () => {
    const tree = z.treeifyError(
      new z.ZodError([
        { code: "custom", message: "Adresse e-mail invalide", path: ["contacts", 0, "email"] },
        { code: "custom", message: "Ce champ est obligatoire", path: ["contacts", 1, "email"] },
      ]),
    );
    toastZodErrorTree(tree);

    const rendered = renderToStaticMarkup(toast.error.mock.calls[0][0]);
    expect(rendered).toContain("Adresse e-mail invalide");
    expect(rendered).toContain("Ce champ est obligatoire");
    expect(rendered).not.toContain("Contacts");
    expect(rendered).not.toContain("Email");
    expect(rendered).not.toContain("contacts[0].email");
    expect(rendered).not.toContain("[0]");
  });

  it("deduplicates the same message emitted on multiple paths", () => {
    const tree = z.treeifyError(
      new z.ZodError([
        { code: "custom", message: "Dieses Feld ist erforderlich.", path: ["firstName"] },
        { code: "custom", message: "Dieses Feld ist erforderlich.", path: ["lastName"] },
      ]),
    );
    toastZodErrorTree(tree);

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith("Dieses Feld ist erforderlich.");
  });

  it("shows a root-level error without adding a path", () => {
    const tree = z.treeifyError(
      new z.ZodError([{ code: "custom", message: "E-mail o password non validi.", path: [] }]),
    );

    expect(toastZodErrorTree(tree)).toBe(true);
    expect(toast.error).toHaveBeenCalledWith("E-mail o password non validi.");
  });

  it("returns false for an empty tree", () => {
    expect(toastZodErrorTree({})).toBe(false);
    expect(toast.error).not.toHaveBeenCalled();
  });
});
