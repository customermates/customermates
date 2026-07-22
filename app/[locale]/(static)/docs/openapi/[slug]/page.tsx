import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { cn } from "@/core/utils/cn";

import { getDocMethod, getDocMethodColor, toLocaleRelativeHref } from "../../docs.utils";
import { apiDocsSource } from "@/core/fumadocs/source";
import { getMDXComponents } from "@/core/fumadocs/mdx-components";
import { PageContainer } from "@/components/shared/page-container";
import { AppLink } from "@/components/shared/app-link";
import { AppChip } from "@/components/chip/app-chip";

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
    <PageContainer>
      <div className="flex flex-row items-start">
        <aside className="hidden lg:flex w-72 shrink-0 self-start sticky top-0 h-full md:h-[calc(100dvh-3rem)] flex-col mr-6">
          <nav className="space-y-2 min-h-0 overflow-y-auto">
            <AppLink
              className="block rounded-md px-2 py-1.5 transition-colors text-subdued hover:text-foreground hover:bg-muted no-underline"
              href="/docs/openapi"
            >
              <span className="truncate text-sm">Overview</span>
            </AppLink>

            {apiDocs.map((doc) => {
              const isSelected = doc.url === page.url;
              const method = getDocMethod(doc);

              return (
                <AppLink
                  key={doc.url}
                  className={cn(
                    "block rounded-md px-2 py-1.5 transition-colors no-underline",
                    isSelected
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-subdued hover:text-foreground hover:bg-muted",
                  )}
                  href={toLocaleRelativeHref(doc.url)}
                >
                  <span className="flex items-center justify-between gap-2 min-w-0">
                    <span className="truncate text-sm">{doc.data.title}</span>

                    {method && (
                      <AppChip className="uppercase shrink-0" size="sm" variant={getDocMethodColor(method)}>
                        {method}
                      </AppChip>
                    )}
                  </span>
                </AppLink>
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
    </PageContainer>
  );
}
