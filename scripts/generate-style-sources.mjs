import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
// Public pages should not download utilities used only by the CRM application.
// Rebuild the import graph for every production build; development keeps Tailwind's
// broad scanning so newly added files and imports work without restarting Next.
/** @param {string} root @param {boolean} development */
export function generateStyleSources(root, development) {
  const output = path.join(root, "styles/.generated");
  fs.mkdirSync(output, { recursive: true });
  const write = (name, sources) => {
    const content = sources.map((file) => `@source ${JSON.stringify(path.relative(output, file))};`).join("\n") + "\n";
    const target = path.join(output, name);
    if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== content) fs.writeFileSync(target, content);
  };
  if (development) {
    write("public.css", [root]);
    return;
  }
  const entries = [];
  const walk = (directory, visit) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "__tests__") continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file, visit);
      else visit(file);
    }
  };
  const special = /^(?:page|layout|loading|error|not-found|global-error|global-not-found|default|template)\.[tj]sx?$/;
  for (const directory of ["app", "app/[locale]"]) {
    for (const name of fs.readdirSync(path.join(root, directory))) {
      if (special.test(name)) entries.push(path.join(root, directory, name));
    }
  }
  walk(path.join(root, "app/[locale]/(static)"), (file) => {
    if (special.test(path.basename(file))) entries.push(file);
  });
  // MDX components enter the graph through the shared registry. A direct import
  // would hide that component's utilities from this graph, so fail explicitly.
  walk(path.join(root, "content"), (file) => {
    if (!file.endsWith(".mdx")) return;
    const body = fs.readFileSync(file, "utf8").replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "");
    if (/^(?:import(?:\s|["'{*])|export\s+(?:\*|\{))/m.test(body)) {
      throw new Error(
        `Register MDX components in core/fumadocs/mdx-components.tsx instead of importing them in ${path.relative(root, file)}`,
      );
    }
  });
  const seen = new Set();
  const configPath = path.join(root, "tsconfig.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) throw new Error(`Cannot read ${configPath}`);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  if (parsed.errors.length) throw new Error(`Invalid TypeScript configuration: ${configPath}`);
  const options = parsed.options;
  const resolve = (specifier, from) => {
    // Fumadocs generates these modules after Next loads its configuration. Their
    // complete MDX input is scanned explicitly through content/ below.
    if (specifier.startsWith("@/.source/") || specifier.startsWith("fumadocs-mdx:collections/")) return;
    if (!specifier.startsWith("@/") && !specifier.startsWith("@api/") && !specifier.startsWith(".")) return;
    if (/\.(?:css|scss|sass|svg|png|jpe?g|webp|avif|gif|woff2?|ttf|mdx)(?:\?.*)?$/.test(specifier)) return;
    const resolved = ts.resolveModuleName(specifier, from, options, ts.sys).resolvedModule?.resolvedFileName;
    if (!resolved) throw new Error(`Public CSS cannot resolve ${specifier} imported by ${path.relative(root, from)}`);
    return resolved.endsWith(".d.ts") ? undefined : resolved;
  };
  while (entries.length) {
    const file = entries.pop();
    if (!file) break;
    if (seen.has(file)) continue;
    seen.add(file);
    if (file.endsWith(".json")) continue;
    const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const add = (specifier) => {
      const target = resolve(specifier, file);
      if (target && !seen.has(target)) entries.push(target);
    };
    const visit = (node) => {
      if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly && ts.isStringLiteral(node.moduleSpecifier)) {
        const bindings = node.importClause?.namedBindings;
        const typeOnly =
          !node.importClause?.name &&
          bindings &&
          ts.isNamedImports(bindings) &&
          bindings.elements.length > 0 &&
          bindings.elements.every((element) => element.isTypeOnly);
        if (!typeOnly) add(node.moduleSpecifier.text);
      } else if (
        ts.isExportDeclaration(node) &&
        !node.isTypeOnly &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        add(node.moduleSpecifier.text);
      } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const specifier = node.arguments[0];
        if (specifier && ts.isStringLiteralLike(specifier)) add(specifier.text);
        else if (
          specifier &&
          ts.isTemplateExpression(specifier) &&
          specifier.head.text === "./locales/" &&
          path.dirname(file) === path.join(root, "i18n")
        ) {
          // Locale JSON has no component imports; scan every supported language.
          seen.add(path.join(root, "i18n/locales"));
        } else if (specifier && ts.isTemplateExpression(specifier) && !/^(?:[.@]|\/)/.test(specifier.head.text)) {
          // External packages (for example Zod locale modules) supply their own styles.
        } else throw new Error(`Public CSS cannot trace a nonliteral dynamic import in ${path.relative(root, file)}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  write("public.css", [...seen, path.join(root, "content")].sort());
}

// Split one compilation, never independently compiled utility subsets: a later
// subset's .hidden could otherwise override an earlier responsive .xl:flex.
export function partitionStyles(root, limit = 80_000) {
  const pieces = [];
  let current = "";
  const flatten = (node, budget) => {
    if (Buffer.byteLength(node.toString()) + 1 <= budget) return [node];
    if (node.type !== "atrule" || !["layer", "media", "supports"].includes(node.name) || !node.nodes) {
      throw new Error("A public CSS rule exceeds the chunk budget");
    }
    const overhead = Buffer.byteLength(node.clone({ nodes: [] }).toString()) + 2;
    return node.nodes.flatMap((child) =>
      flatten(child, budget - overhead).map((part) => node.clone({ nodes: [part.clone()] })),
    );
  };
  const append = (node) => {
    const css = node.toString() + (node.type === "atrule" && !node.nodes ? ";" : "");
    if (current && Buffer.byteLength(current + css) + 1 > limit) {
      pieces.push(current);
      current = "";
    }
    current += css + "\n";
  };
  for (const node of root.nodes) for (const part of flatten(node, limit)) append(part);
  if (current) pieces.push(current);
  return pieces;
}

/** @param {string} root @param {boolean} development */
export async function generatePublicStyles(root, development) {
  const output = path.join(root, "styles/.generated");
  if (development) {
    for (let index = 0; index < 4; index++) {
      fs.writeFileSync(
        path.join(output, `public-${index}.css`),
        index === 0 ? '@import "../public.css";\n' : "/* development */\n",
      );
    }
    return;
  }
  const [{ default: postcss }, { default: tailwind }] = await Promise.all([
    import("postcss"),
    import("@tailwindcss/postcss"),
  ]);
  const source = path.join(root, "styles/public.css");
  const compiled = await postcss([tailwind({ optimize: true })]).process(fs.readFileSync(source, "utf8"), {
    from: source,
  });
  const parts = partitionStyles(compiled.root);
  if (parts.length > 4)
    throw new Error("Public CSS exceeds its four-chunk budget; review candidates before adding assets");
  for (let index = 0; index < 4; index++) {
    fs.writeFileSync(path.join(output, `public-${index}.css`), parts[index] ?? "/* empty */\n");
  }
}
