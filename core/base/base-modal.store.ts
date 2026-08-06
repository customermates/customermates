import type { RootStore } from "../stores/root.store";

import { makeObservable, observable, action } from "mobx";

import type { Resource } from "@/generated/prisma";

import { BaseFormStore } from "./base-form.store";

export abstract class BaseModalStore<T extends object = object> extends BaseFormStore<T> {
  public isOpen = false;
  public isEditingCustomField = false;
  public isClosingWithGuard = false;
  public focusReturnTarget: HTMLElement | null = null;
  public focusReturnFallback: HTMLElement | null = null;

  constructor(rootStore: RootStore, initialState: T, resource?: Resource) {
    super(rootStore, initialState, resource);

    rootStore.registerModalStore(this);

    makeObservable(this, {
      isOpen: observable,
      isEditingCustomField: observable,
      isClosingWithGuard: observable,

      setIsClosingWithGuard: action,
      toggleEditingCustomField: action,
      setIsEditingCustomField: action,
      open: action,
      openFrom: action,
      close: action,
    });
  }

  setIsClosingWithGuard = (isClosingWithGuard: boolean) => {
    this.isClosingWithGuard = isClosingWithGuard;
  };

  toggleEditingCustomField = () => {
    this.isEditingCustomField = !this.isEditingCustomField;
  };

  setIsEditingCustomField = (next: boolean) => {
    this.isEditingCustomField = next;
  };

  open = () => {
    this.focusReturnTarget = null;
    this.focusReturnFallback = null;
    this.isEditingCustomField = false;
    this.isOpen = true;
  };

  openFrom = (focusReturnTarget: HTMLElement, focusReturnFallback?: HTMLElement | null) => {
    this.focusReturnTarget = focusReturnTarget.isConnected ? focusReturnTarget : null;
    this.focusReturnFallback = focusReturnFallback?.isConnected ? focusReturnFallback : null;
    this.isEditingCustomField = false;
    this.isOpen = true;
  };

  openWith = (initial: Partial<T>) => {
    this.onInitOrRefresh(initial);
    this.open();
  };

  close = () => {
    this.isClosingWithGuard = false;
    this.isOpen = false;
    this.isLoading = false;
    this.focusReturnTarget = null;
    this.focusReturnFallback = null;
  };
}
