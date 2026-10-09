import type { MovedToTrash } from "@/features/trash/moved-to-trash";
import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { WikiPageDto, WikiPageKind } from "@/features/wiki/wiki.schema";

import { action, computed, makeObservable, observable } from "mobx";
import { Action, Resource } from "@/generated/prisma";

import { BaseFormStore } from "@/core/base/base-form.store";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { serializedFailureErrorTree } from "@/core/validation/validation.utils";
import { parseMarkdownToJSON, serializeJSONToMarkdown } from "@/components/editor/editor.utils";

import { createWikiPagesAction, deleteWikiPageAction, getWikiPageAction, updateWikiPageAction } from "../actions";

export type WikiPageForm = {
  id: string | null;
  title: string;
  markdown: string;
  kind: WikiPageKind;
  whenToUse: string;
  updatedAt: Date | null;
};

function pageForm(page: WikiPageDto | null): WikiPageForm {
  return page
    ? {
        id: page.id,
        title: page.title,
        markdown: page.markdown,
        kind: page.kind,
        whenToUse: page.whenToUse ?? "",
        updatedAt: page.updatedAt,
      }
    : { id: null, title: "", markdown: "", kind: "knowledge", whenToUse: "", updatedAt: null };
}

export class WikiPageStore extends BaseFormStore<WikiPageForm> {
  editorDocument: object;
  creating = false;
  conflict = false;
  unavailable = false;
  private receivedPageId: string | null;
  private receivedRequestedPageId?: string;
  private receivedServerSnapshot = false;
  private viewGeneration = 0;
  private pendingMutationSelection: {
    requestedPageId?: string;
    previousPageId: string | null;
    pageId: string | null;
  } | null = null;

  constructor(
    rootStore: RootStore,
    page: WikiPageDto | null,
    private onChanged: (pageId: string | null) => void = () => {},
  ) {
    super(rootStore, pageForm(page), Resource.wiki);
    this.editorDocument = parseMarkdownToJSON(page?.markdown ?? "");
    this.receivedPageId = page?.id ?? null;
    makeObservable<this, "pendingMutationSelection" | "completeMutation">(this, {
      pendingMutationSelection: observable.ref,
      completeMutation: action,
      awaitingSelection: computed,
      editorDocument: observable.ref,
      creating: observable,
      conflict: observable,
      unavailable: observable,
      receivePage: action,
      receiveServerPage: action,
      showRestored: action,
      releaseView: action,
      load: action,
      startCreate: action,
      onEditorChange: action,
      resetDocument: action,
      setConflict: action,
      setUnavailable: action,
      reload: action,
      onSubmit: action,
      delete: action,
    });
  }

  attachOnChanged = (onChanged: (pageId: string | null) => void): (() => void) => {
    this.onChanged = onChanged;
    return () => {
      if (this.onChanged === onChanged) this.onChanged = () => {};
    };
  };

  initializeServerPage = (page: WikiPageDto | null, requestedPageId?: string) => {
    if (!this.receivedServerSnapshot) this.receiveServerPage(page, requestedPageId);
  };

  get awaitingSelection(): boolean {
    return this.pendingMutationSelection !== null;
  }

  private completeMutation = (
    page: WikiPageDto | null,
    previousSelection?: { requestedPageId?: string; previousPageId: string | null },
  ) => {
    this.load(page);
    if (previousSelection) {
      this.pendingMutationSelection = { ...previousSelection, pageId: page?.id ?? null };
      this.setIsLoading(true);
    }
    this.onChanged(page?.id ?? null);
  };

  showRestored = (pageId: string) => {
    if (this.pendingMutationSelection) this.pendingMutationSelection = { ...this.pendingMutationSelection, pageId };
    this.onChanged(pageId);
  };

  receiveServerPage = (page: WikiPageDto | null, requestedPageId?: string) => {
    const pending = this.pendingMutationSelection;
    if (pending) {
      const acknowledged = pending.pageId
        ? requestedPageId === pending.pageId
        : requestedPageId === undefined && page?.id !== pending.previousPageId;
      const anotherSelection =
        requestedPageId !== pending.requestedPageId && requestedPageId !== (pending.pageId ?? undefined);
      if (!acknowledged && !anotherSelection) return;
      this.pendingMutationSelection = null;
      this.setIsLoading(false);
    }
    const selectionChanged = this.receivedServerSnapshot && this.receivedRequestedPageId !== requestedPageId;
    this.receivedServerSnapshot = true;
    this.receivedRequestedPageId = requestedPageId;
    if (selectionChanged && requestedPageId !== this.form.id) this.load(page);
    else this.receivePage(page);
  };

  releaseView = () => {
    this.receivedServerSnapshot = false;
    this.receivedRequestedPageId = undefined;
    this.load(null);
  };

  receivePage = (page: WikiPageDto | null) => {
    const samePage = this.receivedPageId === (page?.id ?? null);
    if (this.creating || this.hasUnsavedChanges || this.isLoading) return;
    if (samePage && page && this.form.updatedAt && page.updatedAt.getTime() < this.form.updatedAt.getTime()) return;
    if (
      samePage &&
      page &&
      this.form.updatedAt?.getTime() === page.updatedAt.getTime() &&
      this.form.title === page.title &&
      this.form.markdown === page.markdown &&
      this.form.kind === page.kind &&
      this.form.whenToUse === (page.whenToUse ?? "")
    )
      return;
    this.load(page);
  };

  load = (page: WikiPageDto | null) => {
    this.viewGeneration += 1;
    this.pendingMutationSelection = null;
    this.receivedPageId = page?.id ?? null;
    this.creating = false;
    this.conflict = false;
    this.unavailable = false;
    this.onInitOrRefresh(pageForm(page));
    this.editorDocument = parseMarkdownToJSON(this.form.markdown);
  };

  startCreate = (initialTitle = "") => {
    if (!this.allows(Action.create) || this.isLoading) return;
    this.viewGeneration += 1;
    this.pendingMutationSelection = null;
    this.creating = true;
    this.conflict = false;
    this.unavailable = false;
    this.onInitOrRefresh(pageForm(null));
    if (initialTitle) this.onChange("title", initialTitle);
    this.editorDocument = parseMarkdownToJSON("");
  };

  onEditorChange = (document: object) => {
    if (!this.canManage || this.isLoading) return;
    this.editorDocument = document;
    this.onChange("markdown", serializeJSONToMarkdown(document));
  };

  resetDocument = () => {
    this.resetForm();
    this.editorDocument = parseMarkdownToJSON(this.form.markdown);
  };

  setConflict = (conflict: boolean) => {
    this.conflict = conflict;
  };

  setUnavailable = () => {
    this.unavailable = true;
  };

  reload = async (): Promise<void> => {
    if (!this.form.id || this.isLoading) return;
    const generation = this.viewGeneration;
    this.setIsLoading(true);
    try {
      const result = await getWikiPageAction(this.form.id);
      if (generation !== this.viewGeneration) return;
      if (!result.ok) this.setError(result.error);
      else if (!result.data) this.setUnavailable();
      else {
        this.load(result.data);
        this.onChanged(result.data.id);
      }
    } finally {
      if (generation === this.viewGeneration) this.setIsLoading(false);
    }
  };

  override onSubmit = async (event?: FormEvent<HTMLFormElement>): Promise<void> => {
    event?.preventDefault();
    if (!this.canManage || this.isLoading || !this.hasUnsavedChanges || this.unavailable) return;

    const generation = this.viewGeneration;
    const previousSelection = { requestedPageId: this.receivedRequestedPageId, previousPageId: this.form.id };
    const creating = this.form.id === null;
    this.setIsLoading(true);
    const whenToUse = this.form.kind === "procedure" && this.form.whenToUse.trim() ? this.form.whenToUse : undefined;
    try {
      const result = this.form.id
        ? await updateWikiPageAction({
            id: this.form.id,
            expectedUpdatedAt: this.form.updatedAt as Date,
            title: this.form.title,
            markdown: this.form.markdown,
            kind: this.form.kind,
            whenToUse,
          })
        : await createWikiPagesAction({
            pages: [{ title: this.form.title, markdown: this.form.markdown, kind: this.form.kind, whenToUse }],
            requireEmpty: false,
          });

      if (generation !== this.viewGeneration) return;
      if (!result.ok) {
        const conflict =
          result.failure.kind === "conflict" &&
          result.failure.issues.some(
            (issue) =>
              issue.customCode === CustomErrorCode.wikiPageConflict || issue.path.includes("expectedUpdatedAt"),
          );
        const issues = result.failure.issues.map((issue) =>
          issue.path[0] === "pages" && typeof issue.path[1] === "number"
            ? { ...issue, path: issue.path.slice(2) }
            : issue,
        );
        this.setConflict(conflict);
        this.setError(conflict ? undefined : serializedFailureErrorTree({ ...result.failure, issues }));
        return;
      }

      const page = Array.isArray(result.data) ? result.data[0] : result.data;
      this.completeMutation(page, creating ? previousSelection : undefined);
    } finally {
      if (generation === this.viewGeneration) this.setIsLoading(false);
    }
  };

  delete = async (): Promise<boolean | MovedToTrash> => {
    if (!this.allows(Action.delete) || !this.form.id || !this.form.updatedAt || this.isLoading) return false;

    const generation = this.viewGeneration;
    const previousSelection = { requestedPageId: this.receivedRequestedPageId, previousPageId: this.form.id };
    this.setIsLoading(true);
    try {
      const result = await deleteWikiPageAction({
        id: this.form.id,
        expectedUpdatedAt: this.form.updatedAt,
      });
      if (!result.ok) {
        if (generation === this.viewGeneration) this.setError(serializedFailureErrorTree(result.failure));
        return false;
      }
      if (generation === this.viewGeneration) this.completeMutation(null, previousSelection);
      return { trashBatchId: result.data.trashBatchId };
    } finally {
      if (generation === this.viewGeneration) this.setIsLoading(false);
    }
  };
}
