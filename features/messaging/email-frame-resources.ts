import postcss, { type Declaration, type Node as CssNode, type Root } from "postcss";
import {
  tokenize,
  TokenType,
  type CSSToken,
  isTokenAtKeyword,
  isTokenFunction,
  isTokenIdent,
  isTokenString,
  isTokenURL,
} from "@csstools/css-tokenizer";
const TRANSPARENT_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=";
const ASCII_SPACE = /[\t\n\f\r ]/u;
type ResourceKind = "image" | "font";
type Policy = {
  showRemoteImages: boolean;
  baseURL: string;
};
type Component = {
  token: CSSToken;
  children?: Component[];
  endToken?: CSSToken;
};
type Replacement = {
  start: number;
  end: number;
  text: string;
};
const SERVER_PROPERTIES = new Set([
  "fill",
  "stroke",
  "filter",
  "mask",
  "clip-path",
  "marker",
  "marker-start",
  "marker-mid",
  "marker-end",
]);
function componentValues(input: string): Component[] | undefined {
  let malformed = false;
  const tokens = tokenize(
    { css: input },
    {
      onParseError: () => {
        malformed = true;
      },
    },
  );
  const result: Component[] = [];
  const frames: {
    children: Component[];
    node?: Component;
    close?: TokenType;
  }[] = [{ children: result }];
  for (const token of tokens) {
    if (token[0] === TokenType.EOF) break;
    if ([TokenType.BadString, TokenType.BadURL].includes(token[0])) malformed = true;
    const close =
      token[0] === TokenType.Function || token[0] === TokenType.OpenParen
        ? TokenType.CloseParen
        : token[0] === TokenType.OpenSquare
          ? TokenType.CloseSquare
          : token[0] === TokenType.OpenCurly
            ? TokenType.CloseCurly
            : undefined;
    if ([TokenType.CloseParen, TokenType.CloseSquare, TokenType.CloseCurly].includes(token[0])) {
      const frame = frames.at(-1);
      if (!frame) return undefined;
      if (!frame.node || frame.close !== token[0]) {
        malformed = true;
        break;
      }
      frame.node.endToken = token;
      frames.pop();
      continue;
    }
    const node: Component = { token };
    const parent = frames.at(-1);
    if (!parent) return undefined;
    parent.children.push(node);
    if (close) {
      node.children = [];
      frames.push({ children: node.children, node, close });
    }
  }
  return malformed || frames.length !== 1 ? undefined : result;
}
function meaningful(nodes: Component[]): Component[] {
  return nodes.filter((node) => node.token[0] !== TokenType.Whitespace && node.token[0] !== TokenType.Comment);
}
function identifier(input: string): string | undefined {
  const nodes = componentValues(input);
  const values = nodes && meaningful(nodes);
  return values?.length === 1 && isTokenIdent(values[0].token) ? values[0].token[4].value : undefined;
}
function atRuleName(rule: { toString(): string }): string | undefined {
  const first = meaningful(componentValues(rule.toString()) ?? [])[0]?.token;
  return isTokenAtKeyword(first) ? first[4].value.toLowerCase() : undefined;
}
function resourceURL(raw: string, kind: ResourceKind, policy: Policy, fragment: boolean): string | undefined {
  const value = raw.trim();
  if (!value) return undefined;
  if (fragment && value.startsWith("#")) return value;
  try {
    const url = new URL(value, policy.baseURL);
    if (url.protocol === "data:") return value;
    if (kind === "image" && policy.showRemoteImages && url.protocol === "https:") return url.href;
  } catch {}
  return undefined;
}
function readVariable(node: Component): string | undefined {
  if (!isTokenFunction(node.token) || node.token[4].value.toLowerCase() !== "var") return undefined;
  const first = meaningful(node.children ?? [])[0]?.token;
  return isTokenIdent(first) && first[4].value.startsWith("--") ? first[4].value : undefined;
}
function variableNames(value: string): Set<string> {
  const result = new Set<string>();
  function walk(nodes: Component[]): void {
    for (const node of nodes) {
      const variable = readVariable(node);
      if (variable) result.add(variable);
      if (node.children) walk(node.children);
    }
  }
  walk(componentValues(value) ?? []);
  return result;
}
function isFontFace(declaration: Declaration): boolean {
  for (let parent: CssNode | undefined = declaration.parent; parent; parent = parent.parent)
    if (parent.type === "atrule" && atRuleName(parent) === "font-face") return true;
  return false;
}
function fontVariables(roots: Root[]): Set<string> {
  const definitions = new Map<string, Set<string>>();
  const result = new Set<string>();
  for (const root of roots) {
    root.walkDecls((declaration) => {
      const name = identifier(declaration.prop);
      if (name?.startsWith("--")) {
        const references = definitions.get(name) ?? new Set<string>();
        for (const reference of variableNames(declaration.value)) references.add(reference);
        definitions.set(name, references);
      }
      if (name?.toLowerCase() === "src" && isFontFace(declaration))
        for (const reference of variableNames(declaration.value)) result.add(reference);
    });
  }
  const queue = [...result];
  for (let index = 0; index < queue.length; index++) {
    for (const reference of definitions.get(queue[index]) ?? []) {
      if (!result.has(reference)) {
        result.add(reference);
        queue.push(reference);
      }
    }
  }
  return result;
}
function nodeReplacement(node: Component, text: string): Replacement {
  return {
    start: node.token[2],
    end: (node.endToken ?? node.token)[3] + 1,
    text,
  };
}
function applyReplacements(input: string, replacements: Replacement[]): string {
  let result = input;
  for (const replacement of [...replacements].sort((a, b) => b.start - a.start))
    result = result.slice(0, replacement.start) + replacement.text + result.slice(replacement.end);
  return result;
}
function resourceValue(
  input: string,
  nodes: Component[],
  property: string | undefined,
  replacements: Replacement[],
): string {
  if (!property || !SERVER_PROPERTIES.has(property.toLowerCase())) return applyReplacements(input, replacements);
  const list = nodes.some((node) => node.token[0] === TokenType.Comma);
  const serverEdits = replacements.map((replacement) => ({
    ...replacement,
    text: list ? "none" : "",
  }));
  return applyReplacements(input, serverEdits).trim() || "none";
}
function editResourceNodes(
  nodes: Component[],
  kind: ResourceKind,
  policy: Policy,
  missingFontVariables: Set<string>,
): {
  replacements: Replacement[];
  forbidden: boolean;
} {
  const replacements: Replacement[] = [];
  let forbidden = false;
  function block(node: Component, string: boolean): void {
    if (kind === "font") forbidden = true;
    else replacements.push(nodeReplacement(node, string ? `"${TRANSPARENT_IMAGE}"` : `url("${TRANSPARENT_IMAGE}")`));
  }
  function walk(children: Component[]): void {
    for (const node of children) {
      if (isTokenURL(node.token)) {
        if (resourceURL(node.token[4].value, kind, policy, kind === "image") === undefined) block(node, false);
        continue;
      }
      if (!isTokenFunction(node.token)) {
        if (node.children) walk(node.children);
        continue;
      }
      const name = node.token[4].value.toLowerCase();
      if (name === "url") {
        const values = meaningful(node.children ?? []);
        const value = values.length === 1 && isTokenString(values[0].token) ? values[0].token[4].value : "";
        if (resourceURL(value, kind, policy, kind === "image") === undefined) block(node, false);
        continue;
      }
      if (kind === "font" && name === "var") {
        const reference = readVariable(node);
        const fallback = node.children?.some((child) => child.token[0] === TokenType.Comma);
        if (reference && missingFontVariables.has(reference) && !fallback) forbidden = true;
      }
      if (["image-set", "-webkit-image-set", "image"].includes(name)) {
        let beginning = true;
        for (const child of node.children ?? []) {
          if (child.token[0] === TokenType.Comma) {
            beginning = true;
            continue;
          }
          if ([TokenType.Whitespace, TokenType.Comment].includes(child.token[0])) continue;
          if (
            beginning &&
            isTokenString(child.token) &&
            resourceURL(child.token[4].value, kind, policy, false) === undefined
          )
            block(child, true);
          beginning = false;
        }
      }
      walk(node.children ?? []);
    }
  }
  walk(nodes);
  return { replacements, forbidden };
}
function fontValue(input: string, policy: Policy, missing: Set<string>): string | undefined {
  const nodes = componentValues(input);
  if (!nodes) return undefined;
  const candidates: {
    nodes: Component[];
    start: number;
    end: number;
  }[] = [{ nodes: [], start: 0, end: input.length }];
  for (const node of nodes) {
    if (node.token[0] === TokenType.Comma) {
      const previous = candidates.at(-1);
      if (!previous) return undefined;
      previous.end = node.token[2];
      candidates.push({
        nodes: [],
        start: node.token[3] + 1,
        end: input.length,
      });
    } else {
      const candidate = candidates.at(-1);
      if (!candidate) return undefined;
      candidate.nodes.push(node);
    }
  }
  const retained = candidates.filter(
    (candidate) =>
      meaningful(candidate.nodes).length > 0 && !editResourceNodes(candidate.nodes, "font", policy, missing).forbidden,
  );
  if (retained.length === candidates.length) return input;
  return retained.length
    ? retained.map((candidate) => input.slice(candidate.start, candidate.end).trim()).join(", ")
    : undefined;
}
function transformRoots(roots: Root[], policy: Policy): Set<Root> {
  const changed = new Set<Root>();
  const relevantVariables = fontVariables(roots);
  const missingVariables = new Set<string>();
  const keptVariables = new Set<string>();
  for (const root of roots) {
    root.walkDecls((declaration) => {
      const name = identifier(declaration.prop);
      if (!name || !relevantVariables.has(name)) return;
      const sanitized = fontValue(declaration.value, policy, missingVariables);
      if (sanitized === undefined) {
        missingVariables.add(name);
        declaration.remove();
        changed.add(root);
      } else {
        keptVariables.add(name);
        if (sanitized !== declaration.value) {
          declaration.value = sanitized;
          declaration.raws.value = undefined;
          changed.add(root);
        }
      }
    });
  }
  for (const name of keptVariables) missingVariables.delete(name);
  for (const root of roots) {
    root.walkAtRules((rule) => {
      if (atRuleName(rule) === "import") {
        rule.remove();
        changed.add(root);
      }
    });
    root.walkDecls((declaration) => {
      const name = identifier(declaration.prop);
      if (name && relevantVariables.has(name)) return;
      if (name?.toLowerCase() === "src" && isFontFace(declaration)) {
        const sanitized = fontValue(declaration.value, policy, missingVariables);
        if (sanitized === undefined) {
          declaration.remove();
          changed.add(root);
        } else if (sanitized !== declaration.value) {
          declaration.value = sanitized;
          declaration.raws.value = undefined;
          changed.add(root);
        }
        return;
      }
      const nodes = componentValues(declaration.value);
      if (!nodes) {
        declaration.remove();
        changed.add(root);
        return;
      }
      const edited = editResourceNodes(nodes, "image", policy, missingVariables);
      if (edited.replacements.length) {
        declaration.value = resourceValue(declaration.value, nodes, name, edited.replacements);
        declaration.raws.value = undefined;
        changed.add(root);
      }
    });
    root.walkAtRules((rule) => {
      if (
        atRuleName(rule) === "font-face" &&
        !rule.nodes?.some((node) => node.type === "decl" && identifier(node.prop)?.toLowerCase() === "src")
      ) {
        rule.remove();
        changed.add(root);
      }
    });
  }
  return changed;
}
function parseCss(input: string, inline: boolean): Root | undefined {
  try {
    if (!componentValues(input)) return undefined;
    const keywordEdits: Replacement[] = [];
    for (const token of tokenize({ css: input })) {
      if (
        isTokenAtKeyword(token) &&
        /^[-a-z_][\da-z_-]*$/iu.test(token[4].value) &&
        token[1] !== `@${token[4].value}`
      ) {
        keywordEdits.push({
          start: token[2],
          end: token[3] + 1,
          text: `@${token[4].value}`,
        });
      }
    }
    const normalized = applyReplacements(input, keywordEdits);
    const root = postcss.parse(inline ? `email-frame{${normalized}}` : normalized, { from: undefined, map: false });
    if (
      inline &&
      (root.nodes.length !== 1 ||
        root.nodes[0].type !== "rule" ||
        root.nodes[0].selector !== "email-frame" ||
        root.nodes[0].nodes.some((node) => node.type !== "decl" && node.type !== "comment"))
    )
      return undefined;
    return root;
  } catch {
    return undefined;
  }
}
function stringifyCss(root: Root, inline: boolean): string {
  if (!inline) return root.toString();
  const serialized = root.toString();
  return serialized.slice(serialized.indexOf("{") + 1, serialized.lastIndexOf("}"));
}
export function sanitizeEmailCss(input: string, showRemoteImages: boolean, baseURL: string, inline = false): string {
  const root = parseCss(input, inline);
  if (!root) return "";
  return transformRoots([root], { showRemoteImages, baseURL }).has(root) ? stringifyCss(root, inline) : input;
}
type SrcsetCandidate = {
  url: string;
  descriptors: string[];
};
function parseSrcset(input: string): SrcsetCandidate[] {
  const candidates: SrcsetCandidate[] = [];
  let position = 0;
  while (position < input.length) {
    while (position < input.length && (ASCII_SPACE.test(input[position]) || input[position] === ",")) position++;
    const start = position;
    while (position < input.length && !ASCII_SPACE.test(input[position])) position++;
    let url = input.slice(start, position);
    if (!url) continue;
    if (url.endsWith(",")) {
      url = url.replace(/,+$/u, "");
      if (url) candidates.push({ url, descriptors: [] });
      continue;
    }
    const descriptors: string[] = [];
    let token = "";
    let parentheses = 0;
    for (; position < input.length; position++) {
      const character = input[position];
      if (character === "(") parentheses++;
      if (character === ")" && parentheses > 0) parentheses--;
      if (character === "," && parentheses === 0) {
        position++;
        break;
      }
      if (ASCII_SPACE.test(character) && parentheses === 0) {
        if (token) {
          descriptors.push(token);
          token = "";
        }
      } else token += character;
    }
    if (token) descriptors.push(token);
    const density = descriptors.filter((value) => /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?x$/iu.test(value));
    const width = descriptors.filter((value) => /^[1-9]\d*w$/u.test(value));
    const height = descriptors.filter((value) => /^[1-9]\d*h$/u.test(value));
    const valid =
      descriptors.length === 0 ||
      (density.length === 1 && descriptors.length === 1 && Number.parseFloat(density[0]) > 0) ||
      (width.length === 1 &&
        density.length === 0 &&
        height.length <= 1 &&
        descriptors.length === width.length + height.length);
    if (valid) candidates.push({ url, descriptors });
  }
  return candidates;
}
function imageAttribute(element: Element, name: string, policy: Policy): void {
  const value = element.getAttribute(name);
  if (value === null) return;
  const allowed = resourceURL(value, "image", policy, false);
  if (allowed === undefined) element.removeAttribute(name);
  else if (allowed !== value) element.setAttribute(name, allowed);
}
function srcsetAttribute(element: Element, policy: Policy): void {
  const original = element.getAttribute("srcset");
  if (original === null) return;
  const retained = parseSrcset(original).flatMap((candidate) => {
    const url = resourceURL(candidate.url, "image", policy, false);
    return url === undefined ? [] : [url + (candidate.descriptors.length ? ` ${candidate.descriptors.join(" ")}` : "")];
  });
  if (!retained.length) element.removeAttribute("srcset");
  else element.setAttribute("srcset", retained.join(", "));
}
function svgPresentationAttribute(element: Element, name: string, policy: Policy): void {
  const original = element.getAttribute(name);
  if (original === null) return;
  const nodes = componentValues(original);
  if (!nodes) {
    element.removeAttribute(name);
    return;
  }
  const edited = editResourceNodes(nodes, "image", policy, new Set());
  if (!edited.replacements.length) return;
  element.setAttribute(name, resourceValue(original, nodes, name, edited.replacements));
}
export function sanitizeEmailFrameResources(root: HTMLElement, showRemoteImages: boolean, baseURL: string): void {
  const policy = { showRemoteImages, baseURL };
  const elements = (selector: string): Element[] => [
    ...(root.matches(selector) ? [root] : []),
    ...root.querySelectorAll(selector),
  ];
  for (const element of elements("img,input[type=image]")) {
    imageAttribute(element, "src", policy);
    srcsetAttribute(element, policy);
  }
  for (const element of elements("picture source")) {
    srcsetAttribute(element, policy);
    element.removeAttribute("src");
  }
  for (const element of elements("[background]")) imageAttribute(element, "background", policy);
  for (const element of elements("video[poster]")) imageAttribute(element, "poster", policy);
  for (const element of elements("audio,video,source,track,embed,iframe")) {
    element.removeAttribute("src");
    element.removeAttribute("srcdoc");
    if (element.tagName.toLowerCase() !== "source" || element.parentElement?.tagName.toLowerCase() !== "picture")
      element.removeAttribute("srcset");
  }
  for (const element of elements("object")) element.removeAttribute("data");
  for (const element of elements("link,meta[http-equiv=refresh]")) element.remove();
  for (const element of elements("base[href]")) element.removeAttribute("href");
  for (const element of elements("svg image,svg feImage")) {
    imageAttribute(element, "href", policy);
    imageAttribute(element, "xlink:href", policy);
  }
  for (const element of elements("svg use")) {
    for (const name of ["href", "xlink:href"]) {
      const value = element.getAttribute(name);
      if (value !== null && !value.trim().startsWith("#")) element.removeAttribute(name);
    }
  }
  const presentationAttributes = [
    "fill",
    "stroke",
    "filter",
    "mask",
    "clip-path",
    "marker",
    "marker-start",
    "marker-mid",
    "marker-end",
    "cursor",
  ];
  for (const name of presentationAttributes)
    for (const element of elements(`svg[${name}],svg [${name}]`)) svgPresentationAttribute(element, name, policy);

  const records: {
    element: Element;
    attribute: boolean;
    original: string;
    parsed?: Root;
  }[] = [];
  for (const element of elements("style")) {
    const original = element.textContent ?? "";
    records.push({
      element,
      attribute: false,
      original,
      parsed: parseCss(original, false),
    });
  }
  for (const element of elements("[style]")) {
    const original = element.getAttribute("style") ?? "";
    records.push({
      element,
      attribute: true,
      original,
      parsed: parseCss(original, true),
    });
  }
  const changed = transformRoots(
    records.flatMap((record) => (record.parsed ? [record.parsed] : [])),
    policy,
  );
  for (const record of records) {
    const result = !record.parsed
      ? ""
      : changed.has(record.parsed)
        ? stringifyCss(record.parsed, record.attribute)
        : record.original;
    if (record.attribute) {
      if (result) record.element.setAttribute("style", result);
      else record.element.removeAttribute("style");
    } else record.element.textContent = result;
  }
}
