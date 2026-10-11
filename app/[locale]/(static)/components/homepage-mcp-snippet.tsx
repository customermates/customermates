import type { ReactNode } from "react";

import { env } from "@/env";
import { DOCS_API_KEY_PLACEHOLDER, getMcpInstallSnippet } from "@/features/docs/mcp-install-snippet";

import { ProductWindow } from "@/components/marketing/product-window";

function highlightJson(line: string): ReactNode[] {
  const tokens: ReactNode[] = [];
  let last = 0;

  for (const match of line.matchAll(/"(?:[^"\\]|\\.)*"/gu)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const isKey = line.slice(end).trimStart().startsWith(":");

    if (start > last) tokens.push(line.slice(last, start));
    tokens.push(
      <span key={start} className={isKey ? "text-primary" : "text-success"}>
        {match[0]}
      </span>,
    );
    last = end;
  }

  if (last < line.length) tokens.push(line.slice(last));

  return tokens;
}

export function HomepageMcpSnippet({ className }: { className?: string }) {
  const snippet = getMcpInstallSnippet("cursor", DOCS_API_KEY_PLACEHOLDER, env.BASE_URL);

  return (
    <ProductWindow className={className}>
      <figure data-homepage-mcp-snippet className="m-0">
        <figcaption className="flex items-center justify-between border-b border-border bg-card px-4 py-2.5 text-xs text-muted-foreground">
          <span className="font-mono">mcp.json</span>

          <span>Cursor</span>
        </figcaption>

        <pre className="m-0 overflow-x-auto bg-card p-4 font-mono text-[12.5px] leading-6 text-muted-foreground">
          <code>
            {snippet.split("\n").map((line, index) => (
              <span key={index} className="block whitespace-pre">
                {highlightJson(line)}
              </span>
            ))}
          </code>
        </pre>
      </figure>
    </ProductWindow>
  );
}
