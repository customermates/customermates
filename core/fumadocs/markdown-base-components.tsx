import type { MDXComponents } from "mdx/types";
import type { ComponentProps } from "react";

import defaultMdxComponents from "fumadocs-ui/mdx";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { AppLink } from "@/components/shared/app-link";
import { MarketingTableFrame } from "@/components/marketing/marketing-table-frame";
import { cn } from "@/lib/utils";

export const markdownBaseComponents: Pick<
  MDXComponents,
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "p"
  | "li"
  | "a"
  | "blockquote"
  | "code"
  | "pre"
  | "table"
  | "thead"
  | "tbody"
  | "tr"
  | "th"
  | "td"
> = {
  h1: ({ className, children, ...props }) => (
    <h1 className={cn("text-x-3xl", className)} {...props}>
      {children}
    </h1>
  ),
  h2: ({ className, children, ...props }) => (
    <h2 className={cn("text-x-2xl", className)} {...props}>
      {children}
    </h2>
  ),
  h3: ({ className, children, ...props }) => (
    <h3 className={cn("text-x-xl", className)} {...props}>
      {children}
    </h3>
  ),
  h4: ({ className, children, ...props }) => (
    <h4 className={cn("text-x-lg", className)} {...props}>
      {children}
    </h4>
  ),
  h5: ({ className, children, ...props }) => (
    <h5 className={cn("text-x-md", className)} {...props}>
      {children}
    </h5>
  ),
  h6: ({ className, children, ...props }) => (
    <h6 className={cn("text-x-sm", className)} {...props}>
      {children}
    </h6>
  ),
  p: ({ className, children, ...props }) => (
    <p className={cn("text-x-md text-default-900 dark:text-default-800", className)} {...props}>
      {children}
    </p>
  ),
  li: ({ className, children, ...props }) => (
    <li className={cn("text-x-md text-default-900 dark:text-default-800", className)} {...props}>
      {children}
    </li>
  ),
  a: ({ className, children, ...props }) => (
    <AppLink
      inheritSize
      className={cn("underline decoration-current", className)}
      {...(props as ComponentProps<typeof AppLink>)}
    >
      {children}
    </AppLink>
  ),
  blockquote: ({ className, children }) => (
    <Alert className={cn("text-primary-600 [&_li]:text-primary-600! [&_p]:text-primary-600!", className)}>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  ),
  code: ({ className, children, ...props }) => (
    <code
      className={cn("rounded-small px-1.5 py-0.5 text-[0.9em] before:content-none after:content-none", className)}
      {...props}
    >
      {children}
    </code>
  ),
  pre: defaultMdxComponents.pre,
  table: ({ className, children, ...props }) => (
    <MarketingTableFrame className="not-prose my-6">
      <table className={cn("w-full border-separate border-spacing-0 text-sm", className)} {...props}>
        {children}
      </table>
    </MarketingTableFrame>
  ),
  thead: ({ className, children, ...props }) => (
    <thead className={cn("bg-muted/20 dark:bg-muted/40", className)} {...props}>
      {children}
    </thead>
  ),
  tbody: ({ className, children, ...props }) => (
    <tbody className={className} {...props}>
      {children}
    </tbody>
  ),
  tr: ({ className, children, ...props }) => (
    <tr className={cn("transition-colors hover:bg-muted/30", className)} {...props}>
      {children}
    </tr>
  ),
  th: ({ className, children, ...props }) => (
    <th className={cn("px-6 py-3 text-left text-x-sm font-semibold text-foreground align-top", className)} {...props}>
      {children}
    </th>
  ),
  td: ({ className, children, ...props }) => (
    <td className={cn("px-6 py-3 text-x-sm text-foreground align-top border-t border-border/50", className)} {...props}>
      {children}
    </td>
  ),
};
