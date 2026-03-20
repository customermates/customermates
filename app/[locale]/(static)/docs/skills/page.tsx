import type { Metadata } from "next";
import type { SkillTag } from "@/core/fumadocs/skills-tags";

import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { DocsPageHeader } from "../components/docs-page-header";

import { SkillsOverviewClient } from "./skills-overview-client";

import { Footer } from "@/app/components/footer";
import { XPageContainer } from "@/components/x-layout-primitives/x-page-container";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { skillsOverviewSource, skillsSource } from "@/core/fumadocs/source";
import { SKILL_TAGS } from "@/core/fumadocs/skills-tags";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/docs/skills" });
}

export default async function DocsSkillsOverviewPage() {
  const locale = await getLocale();
  const page = skillsOverviewSource.getPage(["skills"], locale);

  if (!page) notFound();

  const skills = skillsSource.getPages(locale).map((skill) => ({
    description: skill.data.description ?? "",
    sourceUrl: skill.data.sourceUrl,
    tags: (skill.data.tags ?? []).filter((tag): tag is SkillTag => (SKILL_TAGS as readonly string[]).includes(tag)),
    title: skill.data.title ?? "",
    url: skill.url,
  }));

  return (
    <XPageContainer>
      <DocsPageHeader description={page.data.description} title={page.data.title} />

      <SkillsOverviewClient skills={skills} />

      <div className="-mx-4 -mb-4 mt-auto pt-4 md:-mx-6 md:-mb-6 md:pt-6">
        <Footer />
      </div>
    </XPageContainer>
  );
}
