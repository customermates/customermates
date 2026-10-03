import type { ReactNode } from "react";
import type { EmailFolder } from "@/ee/messaging/email-folders";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  canUpdate: true,
  provider: "mail" as string,
  moving: new Set<string>(),
  context: null as unknown,
  move: vi.fn(),
  items: [] as Array<{ title: string; onSelect: () => unknown }>,
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    userStore: { can: () => harness.canUpdate },
    messagingThreadDetailStore: {
      thread: { id: "t1", provider: harness.provider },
      folderContext: harness.context,
      movingThreadIds: harness.moving,
      moveToFolder: harness.move,
    },
  }),
}));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({ collator: new Intl.Collator("en") }),
}));
vi.mock("@/core/errors/report-application-error", () => ({ runUserAction: (action: () => unknown) => action() }));
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => children,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => children,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => createElement("div", {}, children),
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => createElement("span", {}, children),
  DropdownMenuItem: (props: { children: ReactNode; title: string; onSelect: () => unknown; disabled?: boolean }) => {
    harness.items.push(props);
    return createElement("button", { disabled: props.disabled }, props.children);
  },
}));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: ReactNode }) => children,
  TooltipContent: () => null,
}));

import { ThreadFolderMenu } from "../thread-folder-menu";

const folder = (id: string, name: string, role: string | null = null): EmailFolder => ({
  id,
  name,
  role,
  totalCount: null,
  unreadCount: null,
});
function render() {
  return renderToStaticMarkup(createElement(ThreadFolderMenu));
}

beforeEach(() => {
  vi.clearAllMocks();
  harness.canUpdate = true;
  harness.provider = "mail";
  harness.moving = new Set();
  harness.items = [];
  harness.context = {
    folders: [folder("inbox", "Inbox"), folder("archive", "Archive"), folder("sent", "Sent", "SENT")],
    currentFolderIds: ["archive"],
    selectedFolderIds: ["inbox", "archive", "sent"],
  };
});

describe("ThreadFolderMenu", () => {
  it("provides a named action rather than a representative folder status", () => {
    const html = render();
    const trigger = html.match(/<button[^>]*data-thread-folder-move[^>]*>[\s\S]*?<\/button>/)?.[0];

    expect(trigger).toContain('aria-label="Inbox.folders.moveConversation"');
    expect(trigger).toContain("lucide-folder-input");
    expect(trigger).not.toContain("Archive");
    expect(harness.items.map((item) => item.title)).toEqual(["Archive", "Inbox"]);
  });

  it("can choose a folder already occupied by one email in a mixed conversation", () => {
    render();
    harness.items.find((item) => item.title === "Archive")?.onSelect();

    expect(harness.move).toHaveBeenCalledWith("archive");
  });

  it("disables the action and shows progress during a move", () => {
    harness.moving.add("t1");

    expect(render()).toContain('disabled=""');
    expect(render()).toContain("lucide-loader-circle");
  });

  it("offers no write control for read-only users, chats, or unsupported providers", () => {
    harness.canUpdate = false;
    expect(render()).toBe("");
    harness.canUpdate = true;
    harness.provider = "google";
    expect(render()).toBe("");
    harness.context = null;
    expect(render()).toBe("");
  });
});
