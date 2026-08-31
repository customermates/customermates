import { ChevronDown } from "lucide-react";

import { getStyleguideChapter, STYLEGUIDE_CHAPTERS, type StyleguideChapterId } from "./styleguide-chapters";

import { Footer } from "@/app/components/footer";
import { MarketingContainer } from "@/components/marketing/marketing-container";
import { cn } from "@/core/utils/cn";
import { IntlLink } from "@/i18n/navigation";

function ChapterLink({ current, href, label }: { current: boolean; href: string; label: string }) {
  return (
    <IntlLink
      aria-current={current ? "page" : undefined}
      className={cn(
        "marketing-transition rounded-full border px-3 py-1.5 text-sm",
        current
          ? "border-border-strong bg-card font-medium"
          : "border-transparent text-muted-foreground hover:border-border hover:bg-card hover:text-foreground",
      )}
      href={href}
    >
      {label}
    </IntlLink>
  );
}

function ChapterSwitcher({ currentChapter }: { currentChapter: StyleguideChapterId }) {
  const current = getStyleguideChapter(currentChapter);

  return (
    <div className="sticky top-16 z-20 w-full border-b border-border bg-background/95 backdrop-blur xl:top-14">
      <MarketingContainer className="py-2.5">
        <nav aria-label="Style guide chapters" className="hidden items-center gap-1 nav:flex">
          <span className="text-meta mr-3 font-mono">Style guide</span>

          {STYLEGUIDE_CHAPTERS.map((chapter) => (
            <ChapterLink
              key={chapter.id}
              current={chapter.id === currentChapter}
              href={chapter.href}
              label={chapter.label}
            />
          ))}
        </nav>

        <details className="group relative nav:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg p-1 text-sm font-medium [&::-webkit-details-marker]:hidden">
            <span>
              <span className="text-muted-foreground">Style guide</span>

              <span aria-hidden className="mx-2 text-border-strong">
                /
              </span>

              {current.label}
            </span>

            <ChevronDown
              aria-hidden
              className="size-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
            />
          </summary>

          <nav
            aria-label="Style guide chapters"
            className="absolute top-[calc(100%+0.625rem)] left-0 flex w-full flex-col gap-1 rounded-card border border-border bg-card p-2"
          >
            {STYLEGUIDE_CHAPTERS.map((chapter) => (
              <ChapterLink
                key={chapter.id}
                current={chapter.id === currentChapter}
                href={chapter.href}
                label={chapter.label}
              />
            ))}
          </nav>
        </details>
      </MarketingContainer>
    </div>
  );
}

function ChapterIntro({ chapterId }: { chapterId: StyleguideChapterId }) {
  const chapter = getStyleguideChapter(chapterId);

  return (
    <header className="w-full pt-14 pb-10 md:pt-20 md:pb-14">
      <MarketingContainer>
        <p className="text-eyebrow">Internal reference, not indexed</p>

        <h1 className="text-display-sm m-0 mt-5 max-w-4xl">{chapter.title}</h1>

        <p className="text-lede mt-6 max-w-3xl">{chapter.description}</p>

        <nav aria-label={`${chapter.label} subsections`} className="mt-8 flex flex-wrap gap-x-5 gap-y-2">
          {chapter.sections.map((section) => (
            <a
              key={section.id}
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              href={`#${section.id}`}
            >
              {section.label}
            </a>
          ))}
        </nav>
      </MarketingContainer>
    </header>
  );
}

export function StyleguideChapter({ chapter, children }: { chapter: StyleguideChapterId; children: React.ReactNode }) {
  return (
    <div className="flex w-full flex-col items-center" data-marketing-flow="continuous">
      <ChapterSwitcher currentChapter={chapter} />

      <ChapterIntro chapterId={chapter} />

      <div className="w-full [&_[id]]:scroll-mt-32">{children}</div>

      <Footer />
    </div>
  );
}
