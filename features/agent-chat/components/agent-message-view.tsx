"use client";

import type { UIMessage } from "ai";

import { useTranslations } from "next-intl";
import { Check, Loader2, Wrench, X } from "lucide-react";
import { Streamdown } from "streamdown";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ApprovalHandlers = {
  onApprove: (approvalId: string) => void;
  onReject: (approvalId: string) => void;
  onAlwaysAllow: (toolName: string, approvalId: string) => void;
};

type ToolUIPartLike = {
  type: string;
  state: string;
  toolName?: string;
  input?: unknown;
  approval?: { id: string; approved?: boolean; reason?: string };
};

function isToolPart(type: string): boolean {
  return type.startsWith("tool-") || type === "dynamic-tool";
}

function toolNameOf(part: ToolUIPartLike): string {
  return part.type === "dynamic-tool" ? (part.toolName ?? "tool") : part.type.replace(/^tool-/, "");
}

function ToolPart({
  part,
  handlers,
  t,
}: {
  part: ToolUIPartLike;
  handlers: ApprovalHandlers;
  t: ReturnType<typeof useTranslations>;
}) {
  const toolName = toolNameOf(part);

  if (part.state === "approval-requested" && part.approval) {
    const approvalId = part.approval.id;
    return (
      <div className="w-full max-w-[85%] rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
        <div className="font-medium">{t("AgentChat.approval.title", { tool: toolName })}</div>

        {part.input ? (
          <pre className="mt-1 max-h-40 overflow-auto rounded bg-background/60 p-2 text-xs whitespace-pre-wrap break-words text-muted-foreground">
            {JSON.stringify(part.input, null, 2)}
          </pre>
        ) : null}

        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => handlers.onApprove(approvalId)}>
            {t("AgentChat.approval.approve")}
          </Button>

          <Button size="sm" variant="outline" onClick={() => handlers.onReject(approvalId)}>
            {t("AgentChat.approval.reject")}
          </Button>

          <Button size="sm" variant="ghost" onClick={() => handlers.onAlwaysAllow(toolName, approvalId)}>
            {t("AgentChat.approval.alwaysAllow")}
          </Button>
        </div>
      </div>
    );
  }

  const { icon, text } = (() => {
    switch (part.state) {
      case "input-streaming":
      case "input-available":
      case "approval-responded":
        return {
          icon: <Loader2 className="size-3 animate-spin" />,
          text: t("AgentChat.tool.running", { tool: toolName }),
        };
      case "output-available":
        return { icon: <Check className="size-3" />, text: t("AgentChat.tool.ran", { tool: toolName }) };
      case "output-denied":
        return { icon: <X className="size-3" />, text: t("AgentChat.tool.denied", { tool: toolName }) };
      case "output-error":
        return { icon: <X className="size-3" />, text: t("AgentChat.tool.failed", { tool: toolName }) };
      default:
        return { icon: <Wrench className="size-3" />, text: toolName };
    }
  })();

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {icon}

      <span>{text}</span>
    </div>
  );
}

export function AgentMessageView({ message, handlers }: { message: UIMessage; handlers: ApprovalHandlers }) {
  const t = useTranslations();
  const isUser = message.role === "user";

  return (
    <div className={cn("flex flex-col gap-2", isUser ? "items-end" : "items-start")}>
      {message.parts.map((part, index) => {
        if (part.type === "text") {
          if (!part.text) return null;

          // User input is literal text; the assistant's reply is markdown, rendered
          // with Streamdown (handles incomplete markdown mid-stream + Shiki code blocks).
          if (isUser) {
            return (
              <div
                key={index}
                className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm break-words whitespace-pre-wrap text-primary-foreground"
              >
                {part.text}
              </div>
            );
          }

          return (
            <div key={index} className="max-w-[92%] rounded-lg bg-muted px-3 py-2 text-foreground">
              <Streamdown
                className="space-y-2 text-sm break-words [&_pre]:overflow-x-auto [&_pre]:rounded-md"
                shikiTheme={["github-light", "github-dark"]}
              >
                {part.text}
              </Streamdown>
            </div>
          );
        }

        if (isToolPart(part.type))
          return <ToolPart key={index} handlers={handlers} part={part as unknown as ToolUIPartLike} t={t} />;

        return null;
      })}
    </div>
  );
}
