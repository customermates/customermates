import type { MDXComponents } from "mdx/types";
import type { LinkProps } from "@heroui/link";

import { cn } from "@heroui/theme";
import defaultMdxComponents from "fumadocs-ui/mdx";

import { XAlert } from "@/components/x-alert";
import { XLink } from "@/components/x-link";

export const markdownBaseComponents: Pick<
  MDXComponents,
  "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "li" | "a" | "blockquote" | "code" | "pre"
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
    <XLink inheritSize className={cn("text-inherit underline decoration-current", className)} {...(props as LinkProps)}>
      {children}
    </XLink>
  ),
  blockquote: ({ className, children }) => (
    <XAlert
      className={cn("text-primary-600 [&_li]:text-primary-600! [&_p]:text-primary-600!", className)}
      color="primary"
    >
      {children}
    </XAlert>
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
};
