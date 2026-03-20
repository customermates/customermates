import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { cn } from "@heroui/theme";

import { getDocMethod, getDocMethodColor, toLocaleRelativeHref } from "../../docs.utils";

import { Footer } from "@/app/components/footer";
import { apiDocsSource } from "@/core/fumadocs/source";
import { getMDXComponents } from "@/core/fumadocs/mdx-components";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { XPageContainer } from "@/components/x-layout-primitives/x-page-container";
import { XLink } from "@/components/x-link";
import { XChip } from "@/components/x-chip/x-chip";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  return generateMetadataFromMeta({ locale, route: "/docs/openapi/:slug", params: { slug } });
}

export default async function OpenApiDocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const locale = await getLocale();
  const page = apiDocsSource.getPage([slug], locale);
  const apiDocs = [...apiDocsSource.getPages(locale)].sort((a, b) =>
    (a.data.title ?? "").localeCompare(b.data.title ?? ""),
  );

  if (!page) notFound();

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
              href="/docs/openapi"
              size="sm"
            >
              <span className="truncate text-sm">Overview</span>
            </XLink>

            {apiDocs.map((doc) => {
              const isSelected = doc.url === page.url;
              const method = getDocMethod(doc);

              return (
                <XLink
                  key={doc.url}
                  className={cn(
                    "block rounded-md px-2 py-1.5 transition-colors",
                    isSelected
                      ? "bg-primary/10 text-primary-600 font-medium"
                      : "text-subdued hover:text-foreground hover:bg-default-100",
                  )}
                  color="foreground"
                  href={toLocaleRelativeHref(doc.url)}
                  size="sm"
                >
                  <span className="flex items-center justify-between gap-2 min-w-0">
                    <span className="truncate text-sm">{doc.data.title}</span>

                    {method && (
                      <XChip className="uppercase shrink-0" color={getDocMethodColor(method)} size="sm">
                        {method}
                      </XChip>
                    )}
                  </span>
                </XLink>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 flex-1 flex flex-col overflow-x-hidden">
          <header>
            <h1 className="text-x-3xl mb-4">{page.data.title}</h1>
          </header>

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
