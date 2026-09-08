import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { WikiPageDto } from "@/features/wiki/wiki.schema";

import { action, computed, makeObservable, observable } from "mobx";
import { Resource } from "@/generated/prisma";

import { BaseFormStore } from "@/core/base/base-form.store";

import { createWikiPagesAction, deleteWikiPageAction, updateWikiPageAction } from "../actions";

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
  editing = false;

  constructor(
    rootStore: RootStore,
    page: WikiPageDto | null,
    private onChanged: (pageId: string | null) => void,
  ) {
    super(rootStore, pageForm(page), Resource.wiki);
    makeObservable(this, {
      editing: observable,
      canManage: computed,
      load: action,
      startCreate: action,
      startEdit: action,
      stopEdit: action,
      setEditing: action,
    });
  }

  override get canManage(): boolean {
    return this.rootStore.appMode !== "demo" && super.canManage;
  }

  load = (page: WikiPageDto | null) => {
    this.editing = false;
    this.onInitOrRefresh(pageForm(page));
  };

  startCreate = () => {
    this.editing = true;
    this.onInitOrRefresh(pageForm(null));
  };

  startEdit = () => {
    if (this.canManage) this.editing = true;
  };

  stopEdit = () => {
    this.resetForm();
    this.editing = false;
  };

  setEditing = (editing: boolean) => {
    this.editing = editing;
  };

  override onSubmit = async (event?: FormEvent<HTMLFormElement>): Promise<void> => {
    event?.preventDefault();
    if (!this.canManage || !this.editing) return;

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
        this.setError(result.error);
        return;
      }

      const page = Array.isArray(result.data) ? result.data[0] : result.data;
      this.onInitOrRefresh(pageForm(page));
      this.editing = false;
      this.onChanged(page.id);
    } finally {
      this.setIsLoading(false);
    }
  };

  delete = async (): Promise<boolean> => {
    if (!this.canManage || !this.form.id || !this.form.updatedAt) return false;

    this.setIsLoading(true);
    try {
      const result = await deleteWikiPageAction({
        id: this.form.id,
        expectedUpdatedAt: this.form.updatedAt,
      });
      if (!result.ok) {
        this.setError(result.error);
        return false;
      }
      this.onChanged(null);
      return true;
    } finally {
      this.setIsLoading(false);
    }
  };
}
