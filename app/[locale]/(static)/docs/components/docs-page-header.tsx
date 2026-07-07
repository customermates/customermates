import { DocsPageActions } from "./docs-page-actions";

type DocsPageHeaderProps = {
  description?: string;
  markdownUrl?: string;
  mcpUrl: string;
  title: string;
};

export function DocsPageHeader({ description, markdownUrl, mcpUrl, title }: DocsPageHeaderProps) {
  return (
    <header className="min-w-0">
      <h1 className="text-x-3xl">{title}</h1>

      {description ? <p className="mt-3 max-w-3xl text-base text-subdued">{description}</p> : null}

      {markdownUrl ? (
        <div className="flex flex-wrap items-center gap-2 pt-4 lg:hidden">
          <DocsPageActions markdownUrl={markdownUrl} mcpUrl={mcpUrl} />
        </div>
      ) : null}
    </header>
  );
}
