import type { Root } from "react-dom/client";
import type { PublicFormEditor } from "@/features/public-form/public-form.schema";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  wide: true,
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastProblem: vi.fn(),
  guard: { register: vi.fn(), unregister: vi.fn() },
  footerDirty: false as boolean,
}));

const translate = vi.hoisted(
  () => (key: string, values?: Record<string, unknown>) => (values ? `${key}:${JSON.stringify(values)}` : key),
);

vi.mock("next-intl", () => ({ useTranslations: () => translate }));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({ formatDescriptiveLongDate: (date: Date) => date.toISOString().slice(0, 10) }),
}));
vi.mock("@/hooks/use-media-query", () => ({ useIsWiderThan: () => harness.wide }));
vi.mock("sonner", () => ({ toast: { success: harness.toastSuccess, error: harness.toastProblem } }));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ navigationGuard: harness.guard }),
}));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: harness.toastError }));
vi.mock("@/core/errors/report-application-error", () => ({
  runUserAction: (action: () => unknown) => void action(),
  reportApplicationError: vi.fn(),
}));
vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ children, href, ...rest }: { children: unknown; href: string }) =>
    createElement("a", { href, ...rest }, children as never),
}));
vi.mock("@/components/shared/copyable-code", () => ({
  CopyableCode: ({ value, id }: { value: string; id?: string }) => createElement("code", { id }, value),
}));
vi.mock("@/components/forms/form-footer-actions", () => ({
  FormFooterActions: ({
    dirty,
    creating,
    saving,
    onSave,
  }: {
    dirty: boolean;
    creating: boolean;
    saving: boolean;
    onSave: () => void;
  }) => {
    harness.footerDirty = dirty;
    return createElement("button", {
      id: "footer-save",
      disabled: (!creating && !dirty) || saving,
      onClick: () => onSave(),
    });
  },
}));

import { PublicFormTab } from "../public-form-tab";
import { PublicFormTabStore } from "../public-form-tab.store";

import { FORM_ID, TYPE_ID, editor, rule, savedForm } from "./public-form-fixtures";

let container: HTMLDivElement;
let root: Root;

function build(data: PublicFormEditor = editor({ form: savedForm() }), rules = [rule()]) {
  const actions = {
    loadEditor: vi.fn().mockResolvedValue({ ok: true, data }),
    save: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    loadRules: vi.fn().mockResolvedValue({ ok: true, data: { items: rules } }),
  };
  return { actions, store: new PublicFormTabStore(TYPE_ID, actions) };
}

async function renderTab(built = build()) {
  await act(async () => {
    root.render(createElement(PublicFormTab, { store: built.store, onClose: vi.fn() }));
    for (let turn = 0; turn < 4; turn += 1) await Promise.resolve();
  });
  return built;
}

function field<T extends HTMLElement>(selector: string): T {
  const found = container.querySelector<T>(selector);
  if (!found) throw new Error(`${selector} did not render.`);
  return found;
}

function type(selector: string, value: string) {
  const input = field<HTMLInputElement | HTMLTextAreaElement>(selector);
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(input, value);
  act(() => {
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const previewTitle = () => container.querySelector("#public-form-preview #public-form-title")?.textContent;

function choose(text: string) {
  const target = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
    (item) => item.textContent === text,
  );
  if (!target) throw new Error(`Tab ${text} did not render.`);
  act(() => {
    target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  vi.clearAllMocks();
  harness.wide = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("PublicFormTab layout", () => {
  it("shows the settings on the left and a phone-width preview of the public page on the right", async () => {
    await renderTab();

    const layout = field("[data-form-layout]");
    expect(layout.getAttribute("data-form-layout")).toBe("wide");
    expect(layout.querySelector("#public-form-section-page")).not.toBeNull();
    expect(layout.querySelector("#public-form-fields")).not.toBeNull();
    expect(layout.querySelector("[data-form-preview-frame]")).not.toBeNull();
    expect(previewTitle()).toBe("Contact us");
    expect(
      layout.querySelector("[data-form-preview-frame]")?.contains(layout.querySelector("#public-form-title-input")),
    ).toBe(false);
  });

  it("stacks the preview under the settings on a narrow screen", async () => {
    harness.wide = false;
    await renderTab();

    expect(field("[data-form-layout]").getAttribute("data-form-layout")).toBe("compact");
    expect(previewTitle()).toBe("Contact us");
  });

  it("says why the form cannot be edited instead of showing the editor", async () => {
    await renderTab(build(editor({ allowed: false, reason: "permissionDenied" })));

    expect(field("#public-form-blocked").textContent).toBe("PublicForm.builder.permissionDenied");
    expect(container.querySelector("[data-form-layout]")).toBeNull();
  });
});

describe("PublicFormTab live preview", () => {
  it("updates the preview as the title is typed", async () => {
    await renderTab();

    type("#public-form-title-input", "Talk to us");

    expect(previewTitle()).toBe("Talk to us");
  });

  it("updates the question label, the help text and the button label in the preview", async () => {
    await renderTab();

    type(`#public-form-builder-field-${"60000000-0000-4000-8000-000000000001"}-label`, "Your full name");
    type("#public-form-submit-label", "Go");

    const preview = field("#public-form-preview");
    expect(preview.textContent).toContain("Your full name");
    expect(preview.querySelector("#public-form-submit")?.textContent).toBe("Go");
  });

  it("adds the consent line in one click and shows it in the preview", async () => {
    await renderTab();
    expect(container.querySelector("#public-form-preview #public-form-consent")).toBeNull();

    act(() => field<HTMLButtonElement>("#public-form-consent-add").click());

    expect(field("#public-form-preview #public-form-consent")).not.toBeNull();
    expect(field("#public-form-preview").textContent).toContain("PublicForm.builder.consentDefault");
    expect(container.querySelector("#public-form-consent-add")).toBeNull();

    act(() => field<HTMLButtonElement>("#public-form-consent-remove").click());
    expect(container.querySelector("#public-form-preview #public-form-consent")).toBeNull();
    expect(container.querySelector("#public-form-consent-add")).not.toBeNull();
  });

  it("shows the done message of the draft in the preview and goes back to the form", async () => {
    await renderTab();

    type("#public-form-success-message", "We will call you back.");
    choose("PublicForm.builder.sectionPreviewDone");

    expect(field("#public-form-preview #public-form-sent-message").textContent).toBe("We will call you back.");
    expect(container.querySelector("#public-form-preview #public-form-title")).toBeNull();

    choose("PublicForm.builder.sectionPreviewForm");
    expect(previewTitle()).toBe("Contact us");
  });
});

describe("PublicFormTab save and the enabled switch", () => {
  it("keeps save off until something changes and saves the switch with the draft", async () => {
    const { actions } = await renderTab();
    expect(field<HTMLButtonElement>("#footer-save").disabled).toBe(true);

    act(() => field<HTMLButtonElement>("#public-form-enabled").click());
    expect(field<HTMLButtonElement>("#footer-save").disabled).toBe(false);

    await act(async () => {
      field<HTMLButtonElement>("#footer-save").click();
      for (let turn = 0; turn < 4; turn += 1) await Promise.resolve();
    });

    expect(actions.save).toHaveBeenCalledOnce();
    expect(actions.save.mock.calls[0][0]).toMatchObject({ id: FORM_ID, enabled: false });
    expect(harness.toastSuccess).toHaveBeenCalledWith("PublicForm.builder.saved");
    expect(actions.loadEditor).toHaveBeenCalledTimes(2);
  });

  it("has one control for turning the form off: the switch, with no separate button", async () => {
    await renderTab();

    expect(container.querySelector("#public-form-enabled")).not.toBeNull();
    expect(container.querySelector("#public-form-turn-off")).toBeNull();
  });

  it("reports a refused save and keeps the edits", async () => {
    const { actions, store } = await renderTab();
    actions.save.mockResolvedValue({ ok: false, error: { errors: ["no"] } });
    type("#public-form-title-input", "Talk to us");

    await act(async () => {
      field<HTMLButtonElement>("#footer-save").click();
      for (let turn = 0; turn < 4; turn += 1) await Promise.resolve();
    });

    expect(harness.toastError).toHaveBeenCalledOnce();
    expect(harness.toastSuccess).not.toHaveBeenCalled();
    expect(store.edited).toBe(true);
  });

  it("reorders the questions with the arrows and shows the new order in the preview", async () => {
    await renderTab();
    const questionsInPreview = () =>
      [...container.querySelectorAll<HTMLLabelElement>("#public-form-preview label")]
        .filter((label) => label.htmlFor !== "public-form-website")
        .map((label) => (label.textContent ?? "").replace(/\*$/u, ""));
    expect(questionsInPreview()).toEqual(["Note", "Name"]);

    const moveUp = container.querySelectorAll<HTMLButtonElement>(
      '#public-form-fields button[aria-label="PublicForm.builder.moveUp"]',
    );
    act(() => moveUp[1].click());

    expect(questionsInPreview()).toEqual(["Name", "Note"]);
  });
});

describe("PublicFormTab unsaved edits", () => {
  it("counts an edited draft as unsaved even while it cannot be saved, so closing asks first", async () => {
    const { store } = await renderTab();
    expect(harness.footerDirty).toBe(false);

    type("#public-form-title-input", "");

    expect(store.config).toBeNull();
    expect(harness.footerDirty).toBe(true);
  });

  it("says what is missing when Save is pressed on a draft that cannot be saved", async () => {
    const { actions } = await renderTab(build(editor()));
    type("#public-form-title-input", "");

    await act(async () => {
      field<HTMLButtonElement>("#footer-save").click();
      for (let turn = 0; turn < 4; turn += 1) await Promise.resolve();
    });

    expect(actions.save).not.toHaveBeenCalled();
    expect(harness.toastProblem).toHaveBeenCalledExactlyOnceWith("PublicForm.builder.incomplete");
  });

  it("registers with the navigation guard while it is open, so the automation links ask before leaving", async () => {
    const { store } = await renderTab();
    expect(harness.guard.register).toHaveBeenCalledExactlyOnceWith(store);

    act(() => root.render(createElement("div")));

    expect(harness.guard.unregister).toHaveBeenCalledExactlyOnceWith(store);
  });
});

describe("PublicFormTab when the list changed", () => {
  it("locks the Include box of a field the list requires and leaves the others free", async () => {
    await renderTab();
    const include = (fieldId: string) => field<HTMLButtonElement>(`#public-form-builder-field-${fieldId}-include`);

    expect(include("60000000-0000-4000-8000-000000000001").disabled).toBe(true);
    expect(include("60000000-0000-4000-8000-000000000001").getAttribute("aria-checked")).toBe("true");
    expect(include("60000000-0000-4000-8000-000000000002").disabled).toBe(false);
  });

  it("tells the owner which required field was added and that saving applies it", async () => {
    const base = editor({ form: savedForm() });
    const fields = base.fields.map((entry) =>
      entry.label === "Company" ? { ...entry, required: true, mustInclude: true } : entry,
    );
    await renderTab(build({ ...base, fields }));

    const notice = field("#public-form-repairs").textContent ?? "";
    expect(notice).toContain('PublicForm.builder.repairsAdded:{"fields":"Company"}');
    expect(notice).toContain("PublicForm.builder.repairsSave");
    expect(field<HTMLButtonElement>("#footer-save").disabled).toBe(false);
  });

  it("tells the owner that the person was switched off and what left the form, without the stale person controls", async () => {
    const saved = savedForm();
    const form = savedForm({
      config: {
        ...saved.config,
        fields: [
          ...saved.config.fields,
          { fieldId: "60000000-0000-4000-8000-000000000099", label: "Budget", helpText: null, required: false },
        ],
        person: {
          typeId: "40000000-0000-4000-8000-000000000002",
          relationshipId: "70000000-0000-4000-8000-000000000001",
          emailLabel: "Email",
          nameLabel: null,
          nameFieldId: null,
        },
      },
    });
    await renderTab(build(editor({ form, peopleLists: [] })));

    const notice = field("#public-form-repairs").textContent ?? "";
    expect(notice).toContain("PublicForm.builder.repairsPersonDropped");
    expect(notice).toContain('PublicForm.builder.repairsDropped:{"fields":"Budget"}');
    expect(container.querySelector("#public-form-person-unavailable")).not.toBeNull();
    expect(container.querySelector("#public-form-preview #public-form-email")).toBeNull();
    expect(field<HTMLButtonElement>("#footer-save").disabled).toBe(false);
  });

  it("shows a required field no form can ask for and the submissions that could not be saved", async () => {
    await renderTab(
      build(
        editor({
          form: savedForm(),
          blockingFields: ["Contract file"],
          failures: { count: 3, lastAt: "2026-11-12T09:00:00.000Z" },
        }),
      ),
    );

    expect(field("#public-form-blocking-fields").textContent).toContain(
      'PublicForm.builder.blockingFields:{"fields":"Contract file"}',
    );
    expect(field("#public-form-failed-submissions").textContent).toBe(
      'PublicForm.builder.failedSubmissions:{"count":3,"date":"2026-11-12"}',
    );
  });

  it("shows no notice for a form that still fits its list", async () => {
    await renderTab();

    expect(container.querySelector("#public-form-repairs")).toBeNull();
    expect(container.querySelector("#public-form-blocking-fields")).toBeNull();
    expect(container.querySelector("#public-form-failed-submissions")).toBeNull();
  });
});

describe("PublicFormTab after submit", () => {
  it("shows the chain and links each listening automation and the add link", async () => {
    await renderTab();

    const chain = field("#public-form-after-submit-chain");
    expect(chain.textContent).toContain('PublicForm.afterSubmit.createRecord:{"list":"Leads"}');
    expect(chain.textContent).toContain('PublicForm.afterSubmit.notify:{"who":"Test User"}');
    expect(field("[data-after-submit-rule]").getAttribute("href")).toBe(
      "/automations?open=80000000-0000-4000-8000-000000000001",
    );
    expect(field("#public-form-add-automation").getAttribute("href")).toBe(
      `/automations?new=formSubmitted&typeId=${TYPE_ID}&sourceId=${FORM_ID}`,
    );
  });

  it("adds the person step when the person is switched on", async () => {
    await renderTab();

    act(() => field<HTMLButtonElement>("#public-form-person-enabled").click());

    expect(field("#public-form-after-submit-chain").textContent).toContain(
      'PublicForm.afterSubmit.person:{"list":"People"}',
    );
  });

  it("says that no automation reacts yet and still offers to add one", async () => {
    await renderTab(build(editor({ form: savedForm() }), []));

    expect(field("#public-form-after-submit-rules").textContent).toContain("PublicForm.afterSubmit.noRules");
    expect(container.querySelector("[data-after-submit-rule]")).toBeNull();
    expect(container.querySelector("#public-form-add-automation")).not.toBeNull();
  });
});
