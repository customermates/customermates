import type { ComponentProps, ComponentType, ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => createElement("div", { "data-slot": "tooltip" }, children),
  TooltipTrigger: ({ children }: { children: ReactNode }) =>
    createElement("span", { "data-slot": "tooltip-trigger" }, children),
  TooltipContent: ({ children }: { children: ReactNode }) =>
    createElement("span", { "data-slot": "tooltip-content" }, children),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { field?: string }) =>
    key === "Common.ariaLabels.explainField" ? `About ${values?.field ?? "field"}` : key,
}));

import { FormFieldHelp } from "../form-field-help";
import { FormOutput } from "../form-output";
import { FormOutputField } from "../form-output-field";

type TestFormOutputProps = Omit<ComponentProps<typeof FormOutput>, "children"> & { children?: ReactNode };
type TestFormFieldHelpProps = Omit<ComponentProps<typeof FormFieldHelp>, "children"> & { children?: ReactNode };
type TestFormOutputFieldProps = Omit<ComponentProps<typeof FormOutputField>, "children"> & { children?: ReactNode };
const TestFormOutput = FormOutput as ComponentType<TestFormOutputProps>;
const TestFormFieldHelp = FormFieldHelp as ComponentType<TestFormFieldHelpProps>;
const TestFormOutputField = FormOutputField as ComponentType<TestFormOutputFieldProps>;

describe("FormOutput", () => {
  it("exposes labelled output as a read-only textbox", () => {
    const markup = renderToStaticMarkup(
      createElement(
        TestFormOutput,
        {
          "aria-labelledby": "deal-value-label",
          id: "deal-value",
        },
        createElement("span", null, "€12,500"),
      ),
    );

    expect(markup).toContain('id="deal-value"');
    expect(markup).toContain('role="textbox"');
    expect(markup).toContain('aria-readonly="true"');
    expect(markup).toContain('aria-labelledby="deal-value-label"');
    expect(markup).toContain('data-field-state="read-only"');
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain("border-border");
    expect(markup).toContain("bg-background");
    expect(markup).not.toContain("bg-input-background");
    expect(markup).toContain("shadow-none");
    expect(markup).toContain("€12,500");
  });

  it("merges caller layout classes without losing the read-only state contract", () => {
    const markup = renderToStaticMarkup(
      createElement(TestFormOutput, { className: "min-h-11 text-right" }, "Calculated value"),
    );

    expect(markup).toContain("min-h-11");
    expect(markup).toContain("text-right");
    expect(markup).not.toContain("min-h-9");
    expect(markup).toContain('aria-readonly="true"');
    expect(markup).toContain('data-field-state="read-only"');
  });
});

describe("FormFieldHelp", () => {
  it("renders a non-submitting, named help control with decorative iconography", () => {
    const markup = renderToStaticMarkup(
      createElement(
        TestFormFieldHelp,
        { label: "About weighted value" },
        "Deal value multiplied by stage probability.",
      ),
    );

    expect(markup).toContain('data-slot="tooltip-trigger"');
    expect(markup).toContain('<button aria-label="About weighted value"');
    expect(markup).toContain('type="button"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('data-slot="tooltip-content"');
    expect(markup).toContain("Deal value multiplied by stage probability.");
  });
});

describe("FormOutputField", () => {
  it("associates the output, help, and description with a visible label", () => {
    const markup = renderToStaticMarkup(
      createElement(
        TestFormOutputField,
        {
          description: "Synced from billing.",
          help: "Change active members to update this value.",
          label: "Active seats",
        },
        "4",
      ),
    );
    const labelId = markup.match(/<label[^>]*id="([^"]+)"/)?.[1];
    const descriptionId = markup.match(/aria-describedby="([^"]+)"/)?.[1];

    expect(labelId).toBeDefined();
    expect(descriptionId).toBeDefined();
    expect(markup).toContain(`aria-labelledby="${labelId}"`);
    expect(markup).toContain(`id="${descriptionId}"`);
    expect(markup).toContain('aria-label="About Active seats"');
    expect(markup).toContain('data-field-state="read-only"');
    expect(markup).toContain("Change active members to update this value.");
    expect(markup).toContain("Synced from billing.");
  });
});
