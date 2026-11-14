import { beforeEach, describe, expect, it, vi } from "vitest";

import { getTemplateIndex } from "@/core/templates/template-index";
import { pageTemplates } from "@/core/templates/template-publication";
import { previewTemplateIndex, templatePreviewActive } from "@/core/templates/template-preview";

import { ALL_CAPABILITIES, entryOf, indexOf, localeOf } from "./template-publication-fixtures";

const state = vi.hoisted(() => ({
  env: { APP_MODE: "cloud", TEMPLATES_PREVIEW: false, VERCEL_ENV: undefined as string | undefined },
}));

vi.mock("@/env", () => ({ env: state.env }));

import { pagePublicationOptions } from "@/core/templates/template-deployment";

describe("the draft preview switch", () => {
  it("is off unless it is asked for", () => {
    expect(templatePreviewActive({ TEMPLATES_PREVIEW: false, VERCEL_ENV: undefined })).toBe(false);
    expect(templatePreviewActive({ TEMPLATES_PREVIEW: false, VERCEL_ENV: "preview" })).toBe(false);
  });

  it("works on a preview deployment and locally", () => {
    expect(templatePreviewActive({ TEMPLATES_PREVIEW: true, VERCEL_ENV: "preview" })).toBe(true);
    expect(templatePreviewActive({ TEMPLATES_PREVIEW: true, VERCEL_ENV: "development" })).toBe(true);
    expect(templatePreviewActive({ TEMPLATES_PREVIEW: true, VERCEL_ENV: undefined })).toBe(true);
  });

  it("is ignored on a production deployment", () => {
    expect(templatePreviewActive({ TEMPLATES_PREVIEW: true, VERCEL_ENV: "production" })).toBe(false);
  });
});

describe("the preview index", () => {
  it("publishes a draft locale that has page text and keeps its own, proof or none setting", () => {
    const index = indexOf(
      entryOf("tracker", {
        locales: {
          de: localeOf({ publicPage: "proof", status: "draft" }),
          en: localeOf({ publicPage: "own", status: "draft" }),
          fr: localeOf({ page: null, publicPage: "own", status: "draft" }),
        },
      }),
    );

    const preview = previewTemplateIndex(index);

    expect(preview[0].locales.en).toMatchObject({ publicPage: "own", status: "published" });
    expect(preview[0].locales.de).toMatchObject({ publicPage: "proof", status: "published" });
    expect(preview[0].locales.fr.status).toBe("draft");
  });

  it("does not change the shipped index", () => {
    const before = JSON.stringify(getTemplateIndex());

    previewTemplateIndex(getTemplateIndex());

    expect(JSON.stringify(getTemplateIndex())).toBe(before);
  });

  it("makes the shipped drafts visible only through the preview", () => {
    const options = { shipped: ALL_CAPABILITIES };
    const shipped = getTemplateIndex();
    const published = shipped.some((entry) => Object.values(entry.locales).some((text) => text.status === "published"));
    if (published) return;

    expect(pageTemplates("en", { ...options, index: shipped })).toEqual([]);
    expect(pageTemplates("en", { ...options, index: previewTemplateIndex(shipped) }).length).toBeGreaterThan(0);
  });
});

describe("the publication options of the public pages", () => {
  beforeEach(() => {
    state.env.APP_MODE = "cloud";
    state.env.TEMPLATES_PREVIEW = false;
    state.env.VERCEL_ENV = undefined;
  });

  it("use the shipped index by default", () => {
    expect(pagePublicationOptions()).toEqual({ deployment: "cloud" });
  });

  it("name the self-hosted deployment", () => {
    state.env.APP_MODE = "self-hosted";

    expect(pagePublicationOptions()).toEqual({ deployment: "self-hosted" });
  });

  it("carry the preview index when the switch is on", () => {
    state.env.TEMPLATES_PREVIEW = true;
    state.env.VERCEL_ENV = "preview";

    expect(pagePublicationOptions().index).toEqual(previewTemplateIndex(getTemplateIndex()));
  });

  it("never carry the preview index on a production deployment", () => {
    state.env.TEMPLATES_PREVIEW = true;
    state.env.VERCEL_ENV = "production";

    expect(pagePublicationOptions()).toEqual({ deployment: "cloud" });
  });
});
