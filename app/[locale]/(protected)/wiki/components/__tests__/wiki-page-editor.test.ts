import type { Root } from "react-dom/client";
import type { Editor as TiptapEditor } from "@tiptap/core";
import type { RootStore } from "@/core/stores/root.store";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { observer } from "mobx-react-lite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), delete: vi.fn(), get: vi.fn() }));
vi.mock("../../actions", () => ({
  createWikiPagesAction: actions.create,
  updateWikiPageAction: actions.update,
  deleteWikiPageAction: actions.delete,
  getWikiPageAction: actions.get,
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: vi.fn() }));

import { Editor } from "@/components/editor/editor";
import { parseMarkdownToJSON } from "@/components/editor/editor.utils";
import { WikiPageStore } from "../wiki-page.store";

const page = {
  id: "10000000-0000-4000-8000-000000000001",
  title: "Our process",
  markdown: "",
  createdAt: new Date("2026-09-09T00:00:00.000Z"),
  updatedAt: new Date("2026-09-09T00:00:00.000Z"),
};
const roots: Root[] = [];
const containers: HTMLElement[] = [];
const LiveWikiEditor = observer(({ store }: { store: WikiPageStore }) =>
  createElement(Editor, {
    data: store.editorDocument,
    readOnly: !store.canManage || store.isLoading,
    onChange: store.onEditorChange,
  }),
);

async function mount(markdown = "") {
  const store = new WikiPageStore(
    {
      userStore: { user: { id: "user-1" }, canManage: () => true },
    } as unknown as RootStore,
    { ...page, markdown },
    vi.fn(),
  );
  const container = document.createElement("div");
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(createElement(LiveWikiEditor, { store }));
    await Promise.resolve();
  });
  const editor = container.querySelector<HTMLElement & { editor: TiptapEditor }>(".ProseMirror")?.editor;
  if (!editor) throw new Error("Expected the real Notes editor");
  return { store, editor, container };
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
});
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  for (const container of containers.splice(0)) container.remove();
});

describe("Wiki live Notes document", () => {
  it("preserves each typed space and the cursor instead of parsing Markdown back", async () => {
    const { store, editor } = await mount();
    act(() => {
      editor.view.dispatch(editor.state.tr.insertText("Hello"));
    });
    act(() => {
      editor.view.dispatch(editor.state.tr.insertText(" "));
    });
    expect(editor.getText()).toBe("Hello ");
    expect(editor.state.selection.from).toBe(7);
    expect(store.editorDocument).toEqual(editor.getJSON());
    expect(store.form.markdown).toBe("Hello ");
    expect(parseMarkdownToJSON(store.form.markdown)).not.toEqual(editor.getJSON());

    act(() => {
      editor.view.dispatch(editor.state.tr.insertText("world"));
    });
    expect(editor.getText()).toBe("Hello world");
    expect(store.form.markdown).toBe("Hello world");
  });

  it("keeps a new paragraph after Enter so the next text lands on the next line", async () => {
    const { store, editor } = await mount();
    act(() => {
      editor.view.dispatch(editor.state.tr.insertText("First paragraph"));
    });
    act(() => {
      editor.commands.keyboardShortcut("Enter");
    });
    expect(editor.getJSON().content).toHaveLength(2);
    expect(store.editorDocument).toEqual(editor.getJSON());

    act(() => {
      editor.view.dispatch(editor.state.tr.insertText("Second paragraph"));
    });
    expect(editor.getJSON().content).toMatchObject([
      { type: "paragraph", content: [{ type: "text", text: "First paragraph" }] },
      { type: "paragraph", content: [{ type: "text", text: "Second paragraph" }] },
    ]);
    expect(store.form.markdown).toBe("First paragraph\n\nSecond paragraph");
  });

  it("rebuilds from canonical Markdown only for reset, load, and successful Save", async () => {
    const { store, editor } = await mount("Original");
    act(() => {
      editor.commands.setTextSelection(editor.state.doc.content.size - 1);
      editor.view.dispatch(editor.state.tr.insertText(" changed "));
    });
    expect(editor.getText()).toBe("Original changed ");
    act(() => store.resetDocument());
    expect(editor.getText()).toBe("Original");
    expect(store.hasUnsavedChanges).toBe(false);

    act(() => store.load({ ...page, markdown: "Reloaded" }));
    expect(editor.getText()).toBe("Reloaded");
    act(() => {
      editor.commands.setTextSelection(editor.state.doc.content.size - 1);
      editor.view.dispatch(editor.state.tr.insertText(" change "));
    });
    actions.update.mockResolvedValue({
      ok: true,
      data: { ...page, markdown: "Reloaded change", updatedAt: new Date("2026-09-10T00:00:00.000Z") },
    });
    await act(async () => {
      await store.onSubmit();
    });
    expect(editor.getText()).toBe("Reloaded change");
    expect(store.editorDocument).toEqual(parseMarkdownToJSON("Reloaded change"));
    expect(store.hasUnsavedChanges).toBe(false);
  });
});
