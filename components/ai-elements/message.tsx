"use client";

import { Copy, Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { createContext, memo, useContext, useMemo, useRef, type ComponentProps, type JSX } from "react";
import { toast } from "sonner";
import {
  extractTableDataFromElement,
  Streamdown,
  tableDataToCSV,
  tableDataToMarkdown,
  type Components,
} from "streamdown";

import { Button } from "@/components/ui/button";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { runUserAction } from "@/core/errors/report-application-error";
import { copyToClipboard } from "@/core/utils/clipboard";
import { cn } from "@/core/utils/cn";

type MarkdownElementProps<Tag extends keyof JSX.IntrinsicElements> = ComponentProps<Tag> & { node?: unknown };

const MessageTableActionsContext = createContext(true);

function withoutNode<Props extends { node?: unknown }>(props: Props): Omit<Props, "node"> {
  const elementProps = { ...props };
  delete elementProps.node;
  return elementProps;
}

function MessageTable({ children, className, ...props }: MarkdownElementProps<"table">) {
  const tableRef = useRef<HTMLTableElement>(null);
  const showActions = useContext(MessageTableActionsContext);
  const t = useTranslations();

  const copyTable = async () => {
    if (!tableRef.current) return;

    const copied = await copyToClipboard(tableDataToMarkdown(extractTableDataFromElement(tableRef.current)));
    if (copied) toast.success(t("AgentChat.ui.tableCopied"));
    else toast.error(t("Common.notifications.copyFailed"));
  };

  const downloadTable = () => {
    if (!tableRef.current) return;

    const csv = tableDataToCSV(extractTableDataFromElement(tableRef.current));
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.download = "customermates-table.csv";
    anchor.href = url;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className="my-3 min-w-0" data-slot="message-table">
      <div className="overflow-x-auto border-y border-border" data-slot="message-table-frame">
        <table
          ref={tableRef}
          className={cn("w-max min-w-full border-collapse caption-bottom text-[13px]", className)}
          data-slot="table"
          {...withoutNode(props)}
        >
          {children}
        </table>
      </div>

      {showActions ? (
        <div className="mt-1 flex items-center justify-start gap-0.5" data-slot="message-table-actions">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={t("AgentChat.ui.copyTable")}
                className="text-muted-foreground"
                size="icon-xs"
                variant="ghost"
                onClick={() => runUserAction(copyTable)}
              >
                <Copy />
              </Button>
            </TooltipTrigger>

            <TooltipContent>{t("AgentChat.ui.copyTable")}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={t("AgentChat.ui.downloadTable")}
                className="text-muted-foreground"
                size="icon-xs"
                variant="ghost"
                onClick={() => runUserAction(downloadTable)}
              >
                <Download />
              </Button>
            </TooltipTrigger>

            <TooltipContent>{t("AgentChat.ui.downloadTable")}</TooltipContent>
          </Tooltip>
        </div>
      ) : null}
    </div>
  );
}

function MessageTableHeader({ className, ...props }: MarkdownElementProps<"thead">) {
  return <TableHeader className={className} {...withoutNode(props)} />;
}

function MessageTableBody({ className, ...props }: MarkdownElementProps<"tbody">) {
  return <TableBody className={className} {...withoutNode(props)} />;
}

function MessageTableRow({ className, ...props }: MarkdownElementProps<"tr">) {
  return <TableRow className={className} {...withoutNode(props)} />;
}

function MessageTableHead({ className, ...props }: MarkdownElementProps<"th">) {
  return <TableHead className={className} {...withoutNode(props)} />;
}

function MessageTableCell({ className, ...props }: MarkdownElementProps<"td">) {
  return <TableCell className={className} {...withoutNode(props)} />;
}

const messageComponents: Components = {
  table: MessageTable,
  thead: MessageTableHeader,
  tbody: MessageTableBody,
  tr: MessageTableRow,
  th: MessageTableHead,
  td: MessageTableCell,
};

export type MessageResponseProps = ComponentProps<typeof Streamdown> & {
  showTableActions?: boolean;
};

export const MessageResponse = memo(function MessageResponse({
  className,
  components,
  showTableActions = true,
  ...props
}: MessageResponseProps) {
  const resolvedComponents = useMemo(
    () => (components ? { ...messageComponents, ...components } : messageComponents),
    [components],
  );

  return (
    <MessageTableActionsContext.Provider value={showTableActions}>
      <Streamdown
        className={cn("size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0", className)}
        components={resolvedComponents}
        {...props}
      />
    </MessageTableActionsContext.Provider>
  );
});

MessageResponse.displayName = "MessageResponse";
