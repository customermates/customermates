import { createElement } from "react";
import { toast } from "sonner";

type ErrorNode = { errors?: string[]; properties?: Record<string, unknown>; items?: unknown[] };

type FlattenedError = { message: string };

function flattenZodErrorTree(tree: unknown): FlattenedError[] {
  const out: FlattenedError[] = [];
  if (!tree || typeof tree !== "object") return out;
  const node = tree as ErrorNode;

  if (Array.isArray(node.errors)) for (const message of node.errors) out.push({ message });

  if (node.properties) for (const child of Object.values(node.properties)) out.push(...flattenZodErrorTree(child));

  if (Array.isArray(node.items)) for (const child of node.items) out.push(...flattenZodErrorTree(child));

  return out;
}

export function toastZodErrorTree(tree: unknown): boolean {
  const messages = flattenZodErrorTree(tree);
  if (messages.length === 0) return false;

  const unique = Array.from(new Set(messages.map(({ message }) => message)));

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
