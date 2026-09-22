import type { MDXComponents } from "mdx/types";

import { APIPage } from "./api-page";
import { getDocsMDXComponents } from "./mdx-components";

export function getApiMDXComponents(components?: MDXComponents): MDXComponents {
  return getDocsMDXComponents({ APIPage, ...components });
}
