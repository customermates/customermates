import type { TemplateIndex } from "./template-index.types";

export type TemplatePreviewEnvironment = {
  TEMPLATES_PREVIEW: boolean;
  VERCEL_ENV: "development" | "preview" | "production" | undefined;
};

export function templatePreviewActive(environment: TemplatePreviewEnvironment): boolean {
  return environment.TEMPLATES_PREVIEW === true && environment.VERCEL_ENV !== "production";
}

export function previewTemplateIndex(index: TemplateIndex): TemplateIndex {
  return index.map((entry) => ({
    ...entry,
    locales: Object.fromEntries(
      Object.entries(entry.locales).map(([locale, text]) => [
        locale,
        text.page ? { ...text, status: "published" as const } : text,
      ]),
    ),
  }));
}
