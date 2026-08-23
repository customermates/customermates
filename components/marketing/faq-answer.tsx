import type { ComponentProps } from "react";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { AppLink } from "@/components/shared/app-link";

type Props = {
  content: string;
};

function Anchor({ children, href }: ComponentProps<"a">) {
  if (!href) return <>{children}</>;

  const isExternal = /^(https?:)?\/\//.test(href) || href.startsWith("mailto:");

  return (
    <AppLink appearance="inline" external={isExternal} href={href}>
      {children}
    </AppLink>
  );
}

export function FAQAnswer({ content }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <ReactMarkdown
        components={{
          a: Anchor,
          li: ({ children }) => <li className="ml-4 list-disc">{children}</li>,
          ol: ({ children }) => <ol className="flex flex-col gap-1.5">{children}</ol>,
          p: ({ children }) => <p>{children}</p>,
          strong: ({ children }) => <strong className="font-medium text-foreground">{children}</strong>,
          ul: ({ children }) => <ul className="flex flex-col gap-1.5">{children}</ul>,
        }}
        remarkPlugins={[remarkGfm]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
