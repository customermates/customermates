import type { Metadata } from "next";

import { LegalMdxPage } from "../components/legal-mdx-page";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/dpa" });
}

export default function DpaPage() {
  return <LegalMdxPage slug="dpa" />;
}
