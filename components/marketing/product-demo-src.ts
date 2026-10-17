export const PUBLIC_DEMO_ORIGIN = "https://demo.customermates.com";

export const DEMO_RECORD_TYPE_IDS = {
  deals: "3ba14418-0840-8ae7-8c7e-52a2a79a481d",
  contacts: "be3cd172-da59-82bd-8ad7-23ef34431a27",
  organizations: "9d9707c5-d1a2-8048-803b-a501301e2bc3",
  tasks: "7fee95c9-d304-8b5e-8c96-4c0e1019f331",
} as const;

export const DEMO_RECORD_LIST_PATHS = {
  deals: `/records/${DEMO_RECORD_TYPE_IDS.deals}`,
  contacts: `/records/${DEMO_RECORD_TYPE_IDS.contacts}`,
  organizations: `/records/${DEMO_RECORD_TYPE_IDS.organizations}`,
  tasks: `/records/${DEMO_RECORD_TYPE_IDS.tasks}`,
} as const;

export function localDemoBaseUrl(): string | null {
  if (process.env.NODE_ENV !== "development") return null;

  const base = process.env.DEMO_PREVIEW_URL || process.env.BASE_URL;

  return base ? base.replace(/\/$/u, "") : null;
}

export function localProductDemoSrc(src: string): string {
  const base = localDemoBaseUrl();
  if (!base) return src;

  const url = new URL(src);
  if (url.origin !== PUBLIC_DEMO_ORIGIN) return src;

  return `${base}${url.pathname}${url.search}${url.hash}`;
}
