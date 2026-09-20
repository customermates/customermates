import type { MDXComponents } from "mdx/types";

import { APIPage } from "./api-page";
import { getMDXComponents } from "./mdx-components";

export function getApiMDXComponents(components?: MDXComponents): MDXComponents {
  return getMDXComponents({ APIPage, ...components });
}
