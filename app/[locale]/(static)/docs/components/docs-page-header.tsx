import { DocsPageActions } from "./docs-page-actions";

type DocsPageHeaderProps = {
  description?: string;
  markdownUrl?: string;
  title: string;
};

export function DocsPageHeader({ description, markdownUrl, title }: DocsPageHeaderProps) {
  return (
    <header className="mb-6 min-w-0 border-b border-divider pb-6">
      <h1 className="text-x-3xl">{title}</h1>

      {description ? <p className="mt-3 max-w-3xl text-base text-subdued">{description}</p> : null}

      {markdownUrl ? (
        <div className="flex flex-wrap items-center gap-2 pt-4">
          <DocsPageActions markdownUrl={markdownUrl} />
        </div>
      ) : null}
    </header>
  );
}
