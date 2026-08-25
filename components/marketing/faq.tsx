import type { ReactElement, ReactNode } from "react";

import { Children, cloneElement, isValidElement } from "react";
import { ChevronDown } from "lucide-react";

import { JsonLd } from "@/components/seo/json-ld";
import { cn } from "@/core/utils/cn";
import { faqPageSchema } from "@/core/seo/schemas";

type FaqItemProps = {
  children: ReactNode;
  defaultOpen?: boolean;
  question: string;
};

function plainText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(plainText).join("");
  if (isValidElement(node)) return plainText((node.props as { children?: ReactNode }).children);
  return "";
}

function faqItemsOf(children: ReactNode): ReactElement<FaqItemProps>[] {
  return Children.toArray(children).filter(
    (child): child is ReactElement<FaqItemProps> => isValidElement(child) && "question" in (child.props ?? {}),
  );
}

export function FaqItem({ children, defaultOpen = false, question }: FaqItemProps) {
  return (
    <details className="group rounded-xl border border-border bg-card" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 text-left text-sm font-medium [&::-webkit-details-marker]:hidden">
        {question}

        <ChevronDown className="size-4 shrink-0 text-subdued transition-transform group-open:rotate-180" />
      </summary>

      <div
        className={cn(
          "prose prose-sm prose-neutral max-w-none px-4 pb-4 dark:prose-invert",
          "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        )}
      >
        {children}
      </div>
    </details>
  );
}

export function Faq({ children }: { children: ReactNode }) {
  const items = faqItemsOf(children);

  if (items.length === 0) return null;

  return (
    <>
      <JsonLd
        schema={faqPageSchema(
          items.map((item) => ({
            answer: plainText(item.props.children).trim(),
            question: item.props.question,
          })),
        )}
      />

      <div className="not-prose flex flex-col gap-3">
        {items.map((item, index) => cloneElement(item, { defaultOpen: index === 0, key: item.props.question }))}
      </div>
    </>
  );
}
