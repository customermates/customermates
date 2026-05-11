import { createElement } from "react";
import { toast } from "sonner";

type ErrorNode = { errors?: string[]; properties?: Record<string, unknown>; items?: unknown[] };

export type FlattenedError = { path: string; message: string };

export function flattenZodErrorTree(tree: unknown, prefix: string = ""): FlattenedError[] {
  const out: FlattenedError[] = [];
  if (!tree || typeof tree !== "object") return out;
  const node = tree as ErrorNode;

  if (Array.isArray(node.errors)) for (const message of node.errors) out.push({ path: prefix, message });

  if (node.properties) {
    for (const [key, child] of Object.entries(node.properties)) {
      const childPrefix = prefix ? `${prefix}.${key}` : key;
      out.push(...flattenZodErrorTree(child, childPrefix));
    }
  }

  if (Array.isArray(node.items)) {
    node.items.forEach((child, i) => {
      const childPrefix = prefix ? `${prefix}[${i}]` : `[${i}]`;
      out.push(...flattenZodErrorTree(child, childPrefix));
    });
  }

  return out;
}

export function getZodErrorFieldLabel(path: string): string {
  if (!path) return "";
  const leaf =
    path
      .split(".")
      .pop()
      ?.replace(/\[\d+\]$/, "") ?? path;
  return leaf
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

export function toastZodErrorTree(tree: unknown): boolean {
  const messages = flattenZodErrorTree(tree);
  if (messages.length === 0) return false;

  const items = messages.map((e) => {
    const label = getZodErrorFieldLabel(e.path);
    return label ? `${label}: ${e.message}` : e.message;
  });

  const unique = Array.from(new Set(items));

  if (unique.length === 1) toast.error(unique[0]);
  else {
    toast.error(
      createElement(
        "div",
        { className: "flex flex-col gap-1.5 text-xs" },
        unique.map((text, i) => createElement("div", { key: i }, text)),
      ),
    );
  }

  return true;
}
