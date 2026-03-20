import type { Metadata } from "next";

import { redirect } from "next/navigation";

import { ResetPasswordCard } from "./reset-password-card";

import { XPageCenter } from "@/components/x-layout-primitives/x-page-center";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/auth/reset-password" });
}

export default async function ResetPasswordPage({ searchParams }: Props) {
  const params = await searchParams;
  const error = params.error;
  if (error === "INVALID_TOKEN") redirect("/auth/forgot-password?info=RESET_LINK_INVALID");

  return (
    <XPageCenter showGridBackground>
      <ResetPasswordCard />
    </XPageCenter>
  );
}
