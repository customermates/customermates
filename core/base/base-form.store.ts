import type { FormEvent } from "react";
import type { $ZodErrorTree } from "zod/v4/core";
import type { RootStore } from "../stores/root.store";

import { makeObservable, observable, computed, action } from "mobx";
import { JSONPath } from "jsonpath-plus";
import equal from "fast-deep-equal/es6";
import { cloneDeep } from "lodash";
import { Action } from "@/generated/prisma";

import type { Resource } from "@/generated/prisma";

import { toastZodErrorTree } from "../utils/toast-zod-error-tree";

import { BaseStore } from "./base.store";

export abstract class BaseFormStore<T extends object = object> extends BaseStore {
  public savedState: T;
  public form: T;
  public isLoading = false;
  public error: $ZodErrorTree<T> | undefined = undefined;
  public withUnsavedChangesGuard = true;
  public readonly resource?: Resource;

  constructor(rootStore: RootStore, initialState: T, resource?: Resource) {
    super(rootStore);
    this.savedState = cloneDeep(initialState);
    this.form = { ...initialState };
    this.resource = resource;

    makeObservable(this, {
      savedState: observable,
      form: observable,
      isLoading: observable,
      error: observable,
      withUnsavedChangesGuard: observable,
      hasUnsavedChanges: computed,
      canReadAll: computed,
      canReadOwn: computed,
      canAccess: computed,
      canManage: computed,
      isReadOnly: computed,
      isDisabled: computed,
      onInitOrRefresh: action,
      onChange: action,
      resetForm: action,
      setIsLoading: action,
      setError: action,
      setWithUnsavedChangesGuard: action,
    });
  }

  get hasUnsavedChanges(): boolean {
    return !equal(this.form, this.savedState);
  }

  onInitOrRefresh = (form: Partial<T>) => {
    this.isLoading = false;
    this.error = undefined;
    this.form = { ...this.form, ...form };
    this.savedState = cloneDeep(this.form);
  };

  setWithUnsavedChangesGuard = (withUnsavedChangesGuard: boolean) => {
    this.withUnsavedChangesGuard = withUnsavedChangesGuard;
  };

  setIsLoading = (isLoading: boolean) => {
    this.isLoading = isLoading;
  };

  setError = (error: $ZodErrorTree<T> | undefined) => {
    this.error = error;
    if (error) toastZodErrorTree(error);
  };

  resetForm = () => {
    this.form = cloneDeep(this.savedState);
  };

  get canAccess(): boolean {
    if (!this.resource) return true;

    void this.rootStore.userStore.user;
    return this.rootStore.userStore.canAccess(this.resource);
  }

  get canReadAll(): boolean {
    if (!this.resource) return true;

    void this.rootStore.userStore.user;
    return this.rootStore.userStore.can(this.resource, Action.readAll);
  }

  get canReadOwn(): boolean {
    if (!this.resource) return true;

    void this.rootStore.userStore.user;
    return this.rootStore.userStore.can(this.resource, Action.readOwn);
  }

  get canManage(): boolean {
    if (!this.resource) return true;

    void this.rootStore.userStore.user;
    return this.rootStore.userStore.canManage(this.resource);
  }

  get isReadOnly(): boolean {
    if (!this.resource) return false;

    if (!this.rootStore.userStore.user) return false;

    return !this.rootStore.userStore.canManage(this.resource);
  }

  get isDisabled(): boolean {
    if (this.isLoading) return true;

    return this.isReadOnly;
  }

  onSubmit?: (event?: FormEvent<HTMLFormElement>) => Promise<void>;

  flushPendingChanges?: () => void;

  getValue = (id: string): unknown => {
    const path = this.normalizeJsonPath(id);
    return JSONPath({ path, json: this.form, wrap: false }) ?? undefined;
  };

  getError = (id: string): string | string[] | undefined => {
    if (!this.error) return undefined;

    const normalizedPath = this.normalizeJsonPath(id);

    const nodes = JSONPath({
      path: normalizedPath,
      json: this.form,
      resultType: "all",
    });

    if (nodes.length === 0) return undefined;

    const path = nodes[0].path as string;
    const pathParts = path
      .slice(2)
      .split(/[\.\[\]]/)
      .filter(Boolean);

    let errorPath = "$.properties";

    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i];
      const isArrayIndex = part.match(/^\d+$/);
      const isLast = i === pathParts.length - 1;
      const nextIsArrayIndex = i < pathParts.length - 1 && pathParts[i + 1]?.match(/^\d+$/);

      if (isArrayIndex) {
        errorPath += `.items[${part}]`;
        if (isLast) errorPath += ".errors";
        else errorPath += ".properties";
      } else {
        errorPath += `.${part}`;
        if (isLast) errorPath += ".errors";
        else if (!nextIsArrayIndex) errorPath += ".properties";
      }
    }

    return JSONPath({
      path: errorPath,
      json: this.error,
      wrap: false,
    });
  };

  onChange = (id: string, value: unknown): void => {
    const tokens = id.match(/[^.\[\]]+/g) ?? [];
    const leaf = tokens.pop();
    if (leaf === undefined) return;

    let parent: unknown = this.form;
    for (const token of tokens) {
      if (parent == null || typeof parent !== "object") return;
      parent = (parent as Record<string, unknown>)[token];
    }
    if (parent == null || typeof parent !== "object") return;

    const previousValue = (parent as Record<string, unknown>)[leaf];
    (parent as Record<string, unknown>)[leaf] = value;
    this.afterChange(id, value, previousValue);
  };

  protected afterChange(_id: string, _value: unknown, _previousValue: unknown): void {}

  private normalizeJsonPath(id: string): string {
    if (id.startsWith("$")) return id;
    if (id.startsWith("[")) return `$${id}`;
    if (id.startsWith(".")) return `$${id}`;
    return `$.${id}`;
  }
}
