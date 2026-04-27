import type { FormEvent } from "react";
import type { $ZodErrorTree } from "zod/v4/core";
import type { RootStore } from "../stores/root.store";

import { createElement } from "react";
import { makeObservable, observable, computed, action } from "mobx";
import { JSONPath } from "jsonpath-plus";
import equal from "fast-deep-equal/es6";
import { cloneDeep } from "lodash";
import { toast } from "sonner";
import { Action } from "@/generated/prisma";

import type { Resource } from "@/generated/prisma";

export abstract class BaseFormStore<T extends object = object> {
  public savedState: T;
  public form: T;
  public isLoading = false;
  public error: $ZodErrorTree<T> | undefined = undefined;
  public withUnsavedChangesGuard = true;
  public readonly resource?: Resource;
  public readonly rootStore: RootStore;

  constructor(rootStore: RootStore, initialState: T, resource?: Resource) {
    this.rootStore = rootStore;
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
    if (error) {
      const messages = this.flattenErrorTree(error);
      if (messages.length > 0) this.announceErrors(messages);
    }
  };

  protected flattenErrorTree(tree: unknown, prefix: string = ""): Array<{ path: string; message: string }> {
    const out: Array<{ path: string; message: string }> = [];
    if (!tree || typeof tree !== "object") return out;
    const node = tree as { errors?: string[]; properties?: Record<string, unknown>; items?: unknown[] };
    if (Array.isArray(node.errors)) for (const msg of node.errors) out.push({ path: prefix, message: msg });

    if (node.properties && typeof node.properties === "object") {
      for (const [key, child] of Object.entries(node.properties)) {
        const childPrefix = prefix ? `${prefix}.${key}` : key;
        out.push(...this.flattenErrorTree(child, childPrefix));
      }
    }
    if (Array.isArray(node.items)) {
      node.items.forEach((child, i) => {
        const childPrefix = prefix ? `${prefix}[${i}]` : `[${i}]`;
        out.push(...this.flattenErrorTree(child, childPrefix));
      });
    }
    return out;
  }

  protected getFieldLabel(path: string): string {
    if (!path) return "";
    const leaf =
      path
        .split(".")
        .pop()
        ?.replace(/\[\d+\]$/, "") ?? path;
    return leaf
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (c) => c.toUpperCase())
      .trim();
  }

  protected announceErrors(errors: Array<{ path: string; message: string }>) {
    const items = errors.map((e) => {
      const label = this.getFieldLabel(e.path);
      return label ? `${label}: ${e.message}` : e.message;
    });

    if (items.length === 1) {
      toast.error(items[0]);
      return;
    }

    toast.error(
      createElement(
        "div",
        { className: "flex flex-col gap-1.5 text-xs" },
        items.map((text, i) => createElement("div", { key: i }, text)),
      ),
    );
  }

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

    // 'path' refers to the JSONPath of the target field in the form data, e.g., '$.customFieldValues[0].value'
    // Removing the '$.' prefix and splitting, e.g., 'customFieldValues[0].value' becomes ['customFieldValues', '0', 'value']
    // This sequence is then used to navigate the treeified Zod error structure, where arrays are represented as .items[N].properties
    // For example: path '$.customFieldValues[0].value' maps to error path '$.properties.customFieldValues.items[0].properties.value.errors'
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

  // Sets a value at a dotted/bracketed path on the form, e.g. "filters[2].value" or "name".
  // Walks to the parent and assigns the leaf — creates the leaf if MobX dropped it (undefined keys disappear).
  onChange = (id: string, value: unknown): void => {
    const tokens = id.match(/[^.\[\]]+/g) ?? [];
    const leaf = tokens.pop();
    if (leaf === undefined) return;

    let parent: unknown = this.form;
    for (const token of tokens) {
      if (parent == null || typeof parent !== "object") return;
      parent = (parent as Record<string, unknown>)[token];
    }
    if (parent != null && typeof parent === "object") (parent as Record<string, unknown>)[leaf] = value;
  };

  private normalizeJsonPath(id: string): string {
    if (id.startsWith("$")) return id;
    if (id.startsWith("[")) return `$${id}`;
    if (id.startsWith(".")) return `$${id}`;
    return `$.${id}`;
  }
}
