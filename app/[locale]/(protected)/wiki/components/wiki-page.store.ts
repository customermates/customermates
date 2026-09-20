import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { WikiPageDto } from "@/features/wiki/wiki.schema";

import { action, makeObservable, observable } from "mobx";
import { Resource } from "@/generated/prisma";

import { BaseFormStore } from "@/core/base/base-form.store";
import { parseMarkdownToJSON, serializeJSONToMarkdown } from "@/components/editor/editor.utils";

import { createWikiPagesAction, deleteWikiPageAction, getWikiPageAction, updateWikiPageAction } from "../actions";

export type WikiPageForm = {
  id: string | null;
  title: string;
  markdown: string;
  updatedAt: Date | null;
};

function pageForm(page: WikiPageDto | null): WikiPageForm {
  return page
    ? {
        id: page.id,
        title: page.title,
        markdown: page.markdown,
        updatedAt: page.updatedAt,
      }
    : { id: null, title: "", markdown: "", updatedAt: null };
}

export class WikiPageStore extends BaseFormStore<WikiPageForm> {
  editorDocument: object;
  creating = false;
  conflict = false;
  unavailable = false;
  private receivedPageId: string | null;

  constructor(
    rootStore: RootStore,
    page: WikiPageDto | null,
    private onChanged: (pageId: string | null) => void,
  ) {
    super(rootStore, pageForm(page), Resource.wiki);
    this.editorDocument = parseMarkdownToJSON(page?.markdown ?? "");
    this.receivedPageId = page?.id ?? null;
    makeObservable(this, {
      editorDocument: observable.ref,
      creating: observable,
      conflict: observable,
      unavailable: observable,
      receivePage: action,
      load: action,
      startCreate: action,
      onEditorChange: action,
      resetDocument: action,
      setConflict: action,
      setUnavailable: action,
    });
  }

  receivePage = (page: WikiPageDto | null) => {
    const samePage = this.receivedPageId === (page?.id ?? null);
    if (samePage && (this.creating || this.hasUnsavedChanges || this.isLoading)) return;
    if (samePage && page && this.form.updatedAt && page.updatedAt.getTime() < this.form.updatedAt.getTime()) return;
    this.load(page);
  };

  load = (page: WikiPageDto | null) => {
    this.receivedPageId = page?.id ?? null;
    this.creating = false;
    this.conflict = false;
    this.unavailable = false;
    this.onInitOrRefresh(pageForm(page));
    this.editorDocument = parseMarkdownToJSON(this.form.markdown);
  };

  startCreate = (initialTitle = "") => {
    if (!this.canManage || this.isLoading) return;
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
    this.setIsLoading(true);
    try {
      const result = await getWikiPageAction(this.form.id);
      if (!result.ok) this.setError(result.error);
      else if (!result.data) this.setUnavailable();
      else {
        this.load(result.data);
        this.onChanged(result.data.id);
      }
    } finally {
      this.setIsLoading(false);
    }
  };

  override onSubmit = async (event?: FormEvent<HTMLFormElement>): Promise<void> => {
    event?.preventDefault();
    if (!this.canManage || this.isLoading || !this.hasUnsavedChanges || this.unavailable) return;

    this.setIsLoading(true);
    try {
      const result = this.form.id
        ? await updateWikiPageAction({
            id: this.form.id,
            expectedUpdatedAt: this.form.updatedAt as Date,
            title: this.form.title,
            markdown: this.form.markdown,
          })
        : await createWikiPagesAction({
            pages: [{ title: this.form.title, markdown: this.form.markdown }],
            requireEmpty: false,
          });

      if (!result.ok) {
        this.setConflict("conflict" in result && result.conflict === true);
        this.setError(result.error);
        return;
      }

      const page = Array.isArray(result.data) ? result.data[0] : result.data;
      this.load(page);
      this.onChanged(page.id);
    } finally {
      this.setIsLoading(false);
    }
  };

  delete = async (): Promise<boolean> => {
    if (!this.canManage || !this.form.id || !this.form.updatedAt || this.isLoading) return false;

    this.setIsLoading(true);
    try {
      const result = await deleteWikiPageAction({
        id: this.form.id,
        expectedUpdatedAt: this.form.updatedAt,
      });
      if (!result.ok) {
        this.setConflict(result.conflict);
        this.setError(result.error);
        return false;
      }
      this.load(null);
      this.onChanged(null);
      return true;
    } finally {
      this.setIsLoading(false);
    }
  };
}
