import type { RootStore } from "../stores/root.store";

import { makeObservable, observable, action } from "mobx";

import type { Resource } from "@/generated/prisma";

import { BaseFormStore } from "./base-form.store";

export abstract class BaseModalStore<T extends object = object> extends BaseFormStore<T> {
  public isOpen = false;
  public isEditingCustomField = false;
  public isClosingWithGuard = false;
  public isSubmittingWithGuard = false;

  constructor(rootStore: RootStore, initialState: T, resource?: Resource) {
    super(rootStore, initialState, resource);

    rootStore.registerModalStore(this);

    makeObservable(this, {
      isOpen: observable,
      isEditingCustomField: observable,
      isClosingWithGuard: observable,
      isSubmittingWithGuard: observable,

      setIsSubmittingWithGuard: action,
      setIsClosingWithGuard: action,
      toggleEditingCustomField: action,
      open: action,
      close: action,
    });
  }

  setIsSubmittingWithGuard = (isSubmittingWithGuard: boolean) => {
    this.isSubmittingWithGuard = isSubmittingWithGuard;
  };

  setIsClosingWithGuard = (isClosingWithGuard: boolean) => {
    this.isClosingWithGuard = isClosingWithGuard;
  };

  toggleEditingCustomField = () => {
    this.isEditingCustomField = !this.isEditingCustomField;
  };

  open = () => {
    this.isEditingCustomField = false;
    this.isOpen = true;
  };

  close = () => {
    this.isClosingWithGuard = false;
    this.isOpen = false;
    this.isLoading = false;
  };
}
