import type { VFile } from "vfile";

import {
  contentLocaleFromPath,
  resolveCommercialTokens,
  resolveCommercialTokensDeep,
} from "../commercial/commercial-tokens";
import { resolveDerivedTokens, resolveDerivedTokensDeep } from "../content/derived-tokens";

type CompilationContext = { filePath: string };

export function commercialTokens() {
  return {
    name: "commercial-tokens",
    doc: {
      frontmatter(this: CompilationContext, data: Record<string, unknown>) {
        return resolveDerivedTokensDeep(resolveCommercialTokensDeep(data, contentLocaleFromPath(this.filePath)));
      },
      vfile(this: CompilationContext, file: VFile) {
        file.value = resolveDerivedTokens(
          resolveCommercialTokens(String(file.value), contentLocaleFromPath(this.filePath)),
        );
        return file;
      },
    },
  };
}
