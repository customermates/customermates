import { defineShikiConfig } from "fumadocs-core/highlight/config";
import { createBundledHighlighter } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

const createHighlighter = createBundledHighlighter({
  langs: {
    bash: () => import("shiki/langs/bash.mjs"),
    csharp: () => import("shiki/langs/csharp.mjs"),
    go: () => import("shiki/langs/go.mjs"),
    html: () => import("shiki/langs/html.mjs"),
    java: () => import("shiki/langs/java.mjs"),
    javascript: () => import("shiki/langs/javascript.mjs"),
    js: () => import("shiki/langs/javascript.mjs"),
    json: () => import("shiki/langs/json.mjs"),
    python: () => import("shiki/langs/python.mjs"),
    toml: () => import("shiki/langs/toml.mjs"),
    ts: () => import("shiki/langs/typescript.mjs"),
    typescript: () => import("shiki/langs/typescript.mjs"),
  },
  themes: {
    "github-dark": () => import("shiki/themes/github-dark.mjs"),
    "github-light": () => import("shiki/themes/github-light.mjs"),
  },
  engine: () => createJavaScriptRegexEngine(),
});

export const highlighting = defineShikiConfig({
  defaultThemes: { themes: { light: "github-light", dark: "github-dark" } },
  createHighlighter: () => createHighlighter({ langs: [], themes: [] }),
});
