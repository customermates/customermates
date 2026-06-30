"use client";

import type { UIMessage } from "ai";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, FileText, Loader2, Wrench, X } from "lucide-react";
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
  output?: unknown;
  approval?: { id: string; approved?: boolean; reason?: string };
};

function isToolPart(type: string): boolean {
  return type.startsWith("tool-") || type === "dynamic-tool";
}

function toolNameOf(part: ToolUIPartLike): string {
  return part.type === "dynamic-tool" ? (part.toolName ?? "tool") : part.type.replace(/^tool-/, "");
}

type RunCodeReportLike = {
  status?: string;
  stdout?: string;
  result?: unknown;
  error?: { message?: string; traceback?: string } | null;
  files?: Array<{ name: string; url: string }>;
  durationMs?: number;
  truncated?: boolean;
  runId?: string;
};

function RunCodeOutput({ raw, t }: { raw: unknown; t: ReturnType<typeof useTranslations> }) {
  let report: RunCodeReportLike | null = null;
  if (typeof raw === "string") {
    try {
      report = JSON.parse(raw) as RunCodeReportLike;
    } catch {
      report = null;
    }
  } else if (raw && typeof raw === "object") report = raw as RunCodeReportLike;

  if (!report) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Check className="size-3" />

        <span>{t("AgentChat.tool.ran", { tool: "run_code" })}</span>
      </div>
    );
  }

  // A background run_code returns { status: "running", runId } immediately.
  if (report.status === "running") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />

        <span>{t("AgentChat.tool.runningBackground")}</span>
      </div>
    );
  }

  const isError = report.status === "error" || Boolean(report.error);
  const seconds = report.durationMs ? (report.durationMs / 1000).toFixed(1) : null;
  const preClass = "mt-1 max-h-64 overflow-auto rounded bg-background/60 p-2 whitespace-pre-wrap break-words";

  return (
    <div className="w-full max-w-[92%] rounded-lg border border-border bg-muted/40 p-2 text-xs">
      <div className="flex items-center gap-1.5 font-medium">
        {isError ? <X className="size-3 text-destructive" /> : <Check className="size-3" />}

        <span>{t(isError ? "AgentChat.tool.failed" : "AgentChat.tool.ran", { tool: "run_code" })}</span>

        {seconds ? <span className="text-muted-foreground">· {seconds}s</span> : null}
      </div>

      {isError && report.error?.message ? <div className="mt-1 text-destructive">{report.error.message}</div> : null}

      {report.error?.traceback ? (
        <details className="mt-1">
          <summary className="cursor-pointer text-muted-foreground">Traceback</summary>

          <pre className={preClass}>{report.error.traceback}</pre>
        </details>
      ) : null}

      {report.stdout ? (
        <details open className="mt-1">
          <summary className="cursor-pointer text-muted-foreground">Output</summary>

          <pre className={preClass}>
            {report.stdout}

            {report.truncated ? "\n… (truncated)" : ""}
          </pre>
        </details>
      ) : null}

      {report.result !== undefined && report.result !== null ? (
        <details open className="mt-1">
          <summary className="cursor-pointer text-muted-foreground">Result</summary>

          <pre className={preClass}>
            {typeof report.result === "string" ? report.result : JSON.stringify(report.result, null, 2)}
          </pre>
        </details>
      ) : null}

      {report.files && report.files.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-2">
          {report.files.map((file) => (
            <a
              key={file.url}
              className="text-primary underline"
              href={file.url}
              rel="noopener noreferrer"
              target="_blank"
            >
              {file.name}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
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

        {toolName === "run_code" ? (
          (part.input as { allowWrite?: boolean } | undefined)?.allowWrite ? (
            <div className="mt-1 text-xs font-medium text-destructive">
              {t("AgentChat.approval.runCodeWriteWarning")}
            </div>
          ) : (
            <div className="mt-1 text-xs text-muted-foreground">{t("AgentChat.approval.runCodeReadOnly")}</div>
          )
        ) : null}

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

  // check_run returns the same report shape as run_code (and "running" while pending).
  if ((toolName === "run_code" || toolName === "check_run") && part.state === "output-available")
    return <RunCodeOutput raw={part.output} t={t} />;

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

// Renders an attached file part: an inline preview for images, a download chip
// otherwise. Uploads are ephemeral (24h TTL / in-memory), so a once-valid image can
// 404 on a reloaded transcript — onError degrades to the chip instead of a broken icon.
function FilePart({ url, mediaType, filename }: { url: string; mediaType?: string; filename?: string }) {
  const [broken, setBroken] = useState(false);
  const name = filename ?? "file";

  if (mediaType?.startsWith("image/") && !broken) {
    return (
      <a className="max-w-[85%]" href={url} rel="noopener noreferrer" target="_blank">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={name}
          className="max-h-48 rounded-lg border border-border object-contain"
          src={url}
          onError={() => setBroken(true)}
        />
      </a>
    );
  }

  if (broken) {
    return (
      <span className="flex max-w-[85%] items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
        <FileText className="size-4 shrink-0" />

        <span className="truncate">{name}</span>
      </span>
    );
  }

  return (
    <a
      className="flex max-w-[85%] items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm"
      href={url}
      rel="noopener noreferrer"
      target="_blank"
    >
      <FileText className="size-4 shrink-0" />

      <span className="truncate">{name}</span>
    </a>
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

        if (part.type === "file") {
          const file = part as { url?: string; mediaType?: string; filename?: string };
          if (!file.url) return null;
          return <FilePart key={index} filename={file.filename} mediaType={file.mediaType} url={file.url} />;
        }

        return null;
      })}
    </div>
  );
}
