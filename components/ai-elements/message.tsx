"use client";

import { Copy, Download, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  createContext,
  memo,
  useContext,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type JSX,
  type MouseEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  defaultRehypePlugins,
  extractTableDataFromElement,
  Streamdown,
  tableDataToCSV,
  tableDataToMarkdown,
  type Components,
  type StreamdownTranslations,
} from "streamdown";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppModal } from "@/components/modal/app-modal";
import { AppLink } from "@/components/shared/app-link";
import { Button } from "@/components/ui/button";
import { OVERLAY_TOPMOST_LAYER_CLASS } from "@/components/ui/overlay-contract";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { runUserAction } from "@/core/errors/report-application-error";
import { copyToClipboard } from "@/core/utils/clipboard";
import { cn } from "@/core/utils/cn";
import { stripLocalePrefix } from "@/i18n/locale-registry";

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

const MESSAGE_LINK_BASE = "https://internal.invalid";
const MESSAGE_LINK_CLASS = "wrap-anywhere font-medium text-primary underline";
const MESSAGE_URL_PROPERTIES = ["href", "src"] as const;
const MESSAGE_HANDOFF_PROTOCOLS = ["mailto:", "tel:"];
const UNLOCALIZED_PATH_PATTERN = /^\/(?:api|og|monitoring|\.well-known|_next|_vercel)(?:\/|$)|\.[a-z0-9]+$/i;

export type MessageLinkTarget =
  | { kind: "app"; href: string }
  | { kind: "resource"; href: string }
  | { kind: "handoff"; url: string }
  | { kind: "external"; url: string };

export function messageLinkTarget(href: string, pageUrl: string = MESSAGE_LINK_BASE): MessageLinkTarget | null {
  const page = new URL(pageUrl);
  let target: URL;
  try {
    target = new URL(href, page);
  } catch {
    return null;
  }

  if (MESSAGE_HANDOFF_PROTOCOLS.includes(target.protocol)) return { kind: "handoff", url: target.toString() };
  if (target.origin !== page.origin) return { kind: "external", url: target.toString() };
  if (UNLOCALIZED_PATH_PATTERN.test(target.pathname))
    return { kind: "resource", href: `${target.pathname}${target.search}${target.hash}` };
  return { kind: "app", href: `${stripLocalePrefix(target.pathname)}${target.search}${target.hash}` };
}

function currentPageUrl() {
  return typeof window === "undefined" ? undefined : window.location.href;
}

type MarkdownNode = { properties?: Record<string, unknown>; children?: MarkdownNode[] };
type MessageRehypePlugin = NonNullable<ComponentProps<typeof Streamdown>["rehypePlugins"]>[number];

function absoluteNetworkPathUrl(value: string) {
  const page = new URL(currentPageUrl() ?? MESSAGE_LINK_BASE);
  try {
    const target = new URL(value, page);
    const web = target.protocol === "http:" || target.protocol === "https:";
    return web && target.origin !== page.origin ? target.toString() : value;
  } catch {
    return value;
  }
}

function rehypeAbsoluteNetworkPathUrls() {
  return function transform(node: MarkdownNode) {
    const properties = node.properties;
    for (const name of MESSAGE_URL_PROPERTIES) {
      const value = properties?.[name];
      if (properties && typeof value === "string") properties[name] = absoluteNetworkPathUrl(value);
    }
    node.children?.forEach(transform);
  };
}

const [hardenPlugin, hardenOptions] = defaultRehypePlugins.harden as Extract<MessageRehypePlugin, readonly unknown[]>;

export const messageHardenRehypePlugins: MessageRehypePlugin[] = [
  rehypeAbsoluteNetworkPathUrls,
  [hardenPlugin, { ...hardenOptions, linkBlockPolicy: "text-only", imageBlockPolicy: "text-only" }],
];

const messageRehypePlugins: MessageRehypePlugin[] = [
  defaultRehypePlugins.raw,
  defaultRehypePlugins.sanitize,
  ...messageHardenRehypePlugins,
];

function MessageExternalLink({ children, className, url }: { children: ReactNode; className?: string; url: string }) {
  const t = useTranslations();
  const [promptOpen, setPromptOpen] = useState(false);

  const copyLink = async () => {
    const copied = await copyToClipboard(url);
    if (copied) toast.success(t("AgentChat.ui.linkCopied"));
    else toast.error(t("Common.notifications.copyFailed"));
  };

  const openLink = () => {
    setPromptOpen(false);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const askFirst = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    setPromptOpen(true);
  };

  return (
    <>
      <AppLink
        external
        appearance="unstyled"
        className={cn(MESSAGE_LINK_CLASS, className)}
        href={url}
        onAuxClick={(event) => {
          if (event.button === 1) askFirst(event);
        }}
        onClick={askFirst}
      >
        {children}
      </AppLink>

      <AppModal
        layerClassName={OVERLAY_TOPMOST_LAYER_CLASS}
        open={promptOpen}
        size="sm"
        title={t("AgentChat.ui.externalLinkTitle")}
        onClose={() => setPromptOpen(false)}
      >
        <AppCard>
          <AppCardHeader>
            <h2 className="text-base font-semibold">{t("AgentChat.ui.externalLinkTitle")}</h2>
          </AppCardHeader>

          <AppCardBody>
            <p className="text-sm">{t("AgentChat.ui.externalLinkWarning")}</p>

            <p className="rounded-md bg-muted p-3 font-mono text-sm break-all" data-slot="message-link-url">
              {url}
            </p>
          </AppCardBody>

          <AppCardFooter>
            <Button variant="secondary" onClick={() => runUserAction(copyLink)}>
              <Copy />

              {t("AgentChat.ui.copyLink")}
            </Button>

            <Button onClick={openLink}>
              <ExternalLink />

              {t("AgentChat.ui.openLink")}
            </Button>
          </AppCardFooter>
        </AppCard>
      </AppModal>
    </>
  );
}

function MessageLink({ children, className, href }: MarkdownElementProps<"a">) {
  const target = href ? messageLinkTarget(href, currentPageUrl()) : null;

  if (!target) return <span className={cn(MESSAGE_LINK_CLASS, className)}>{children}</span>;

  if (target.kind === "handoff") {
    return (
      <a className={cn(MESSAGE_LINK_CLASS, className)} href={target.url}>
        {children}
      </a>
    );
  }

  if (target.kind === "external") {
    return (
      <MessageExternalLink className={className} url={target.url}>
        {children}
      </MessageExternalLink>
    );
  }

  if (target.kind === "resource") {
    return (
      <AppLink
        external
        appearance="unstyled"
        className={cn(MESSAGE_LINK_CLASS, className)}
        href={target.href}
        prefetch={false}
      >
        {children}
      </AppLink>
    );
  }

  return (
    <AppLink appearance="unstyled" className={cn(MESSAGE_LINK_CLASS, className)} href={target.href}>
      {children}
    </AppLink>
  );
}

const messageComponents: Components = {
  a: MessageLink,
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
  const t = useTranslations();
  const resolvedComponents = useMemo(
    () => (components ? { ...messageComponents, ...components } : messageComponents),
    [components],
  );
  const translations = useMemo<Partial<StreamdownTranslations>>(
    () => ({
      copyCode: t("AgentChat.ui.copyCode"),
      downloadFile: t("AgentChat.ui.downloadFile"),
      downloadImage: t("AgentChat.ui.downloadImage"),
      imageNotAvailable: t("AgentChat.ui.imageNotAvailable"),
    }),
    [t],
  );

  return (
    <MessageTableActionsContext.Provider value={showTableActions}>
      <Streamdown
        className={cn("size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0", className)}
        components={resolvedComponents}
        rehypePlugins={messageRehypePlugins}
        translations={translations}
        {...props}
      />
    </MessageTableActionsContext.Provider>
  );
});

MessageResponse.displayName = "MessageResponse";
