import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { cn } from "@heroui/theme";

import { toLocaleRelativeHref } from "../../docs.utils";
import { CopySetupCommandButton } from "../copy-setup-command-button";
import { sortSkillsByGroupAndTitle } from "../skills-ordering.utils";
import { SourceBadge } from "../source-badge";

import { BASE_URL } from "@/constants/env";
import { Footer } from "@/app/components/footer";
import { getMDXComponents } from "@/core/fumadocs/mdx-components";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { skillsSource } from "@/core/fumadocs/source";
import { XPageContainer } from "@/components/x-layout-primitives/x-page-container";
import { XLink } from "@/components/x-link";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  return generateMetadataFromMeta({ locale, route: "/docs/skills/:slug", params: { slug } });
}

export default async function DocsSkillPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const locale = await getLocale();
  const t = await getTranslations("SkillsPage");
  const page = skillsSource.getPage([slug], locale);

  if (!page) notFound();

  const skills = sortSkillsByGroupAndTitle(skillsSource.getPages(locale));
  const markdownUrl = new URL(`/${locale}/raw/skills/${slug}.md`, BASE_URL).toString();
  const setupCommand = t("agentSetupCommand", { url: markdownUrl });
  const MDX = page.data.body;
  const components = getMDXComponents();

  return (
    <XPageContainer>
      <div className="flex flex-row items-start">
        <aside className="hidden lg:flex w-72 shrink-0 self-start sticky top-0 h-full md:h-[calc(100dvh-3rem)] flex-col mr-6">
          <nav className="space-y-2 min-h-0 overflow-y-auto">
            <XLink
              className="block rounded-md px-2 py-1.5 transition-colors text-subdued hover:text-foreground hover:bg-default-100"
              color="foreground"
              href="/docs/skills"
              size="sm"
            >
              <span className="truncate text-sm">Overview</span>
            </XLink>

            {skills.map((skill) => {
              const isSelected = skill.url === page.url;

              return (
                <XLink
                  key={skill.url}
                  className={cn(
                    "block rounded-md px-2 py-1.5 transition-colors",
                    isSelected
                      ? "bg-primary/10 text-primary-600 font-medium"
                      : "text-subdued hover:text-foreground hover:bg-default-100",
                  )}
                  color="foreground"
                  href={toLocaleRelativeHref(skill.url)}
                  size="sm"
                >
                  <span className="block truncate text-sm">{skill.data.title}</span>
                </XLink>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 flex-1 flex flex-col overflow-x-hidden">
          <header>
            <h1 className="text-x-3xl mb-4">{page.data.title}</h1>
          </header>

          <section className="mb-8 rounded-lg border border-divider p-4 bg-content1/30">
            <div className="mb-3 flex flex-wrap justify-between items-center gap-2">
              <p className="text-subdued">{t("agentSetupTitle")}</p>

              <CopySetupCommandButton value={setupCommand} />
            </div>

            <pre className="overflow-x-auto rounded-md bg-default-100 p-3 text-xs">
              <code>{setupCommand}</code>
            </pre>

            <SourceBadge
              className="mt-3 inline-flex items-center gap-1.5 text-xs text-subdued"
              sourceUrl={page.data.sourceUrl}
            />
          </section>

          <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none [&_.fd-codeblock]:mx-0 [&_.fd-codeblock]:w-full [&_pre]:mx-0 [&_pre]:w-full">
            <MDX components={components} />
          </div>
        </div>
      </div>

      <div className="-mx-4 -mb-4 mt-auto pt-4 md:-mx-6 md:-mb-6 md:pt-6">
        <Footer />
      </div>
    </XPageContainer>
  );
}
