import type { Metadata } from "next";

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { submitPublicFormAction } from "./actions";
import { PublicFormUnavailable } from "./public-form-unavailable";
import { PublicFormView } from "./public-form-view";

import { getReadPublicFormInteractor } from "@/core/di";
import { buildLocalePath } from "@/i18n/locale-registry";

import { visitorKey } from "../../p/[token]/visitor-key";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ token: string; locale: string }>;
  searchParams: Promise<{ embed?: string }>;
};

const ROBOTS = { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("PublicForm.pageTitle"), robots: ROBOTS, referrer: "no-referrer" };
}

export default async function PublicFormPage({ params, searchParams }: Props) {
  const [{ token, locale }, { embed }] = await Promise.all([params, searchParams]);
  const result = await getReadPublicFormInteractor().invoke({ token, visitor: await visitorKey() });
  if (result.status !== "available") return <PublicFormUnavailable rateLimited={result.status === "rateLimited"} />;

  const { form } = result;
  if (form.locale && form.locale !== locale)
    redirect(`${buildLocalePath(form.locale, `/f/${token}`)}${embed === "1" ? "?embed=1" : ""}`);

  return (
    <PublicFormView
      embedded={embed === "1"}
      form={form}
      locale={locale}
      token={token}
      onSubmit={submitPublicFormAction}
    />
  );
}
