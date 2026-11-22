import type { RootStore } from "@/core/stores/root.store";
import type { OnboardingTemplateCard } from "@/features/onboarding-templates/onboarding-template-offer";

import { action, makeObservable, observable } from "mobx";

import { BaseModalStore } from "@/core/base/base-modal.store";

export type AddPickerScreen = "add" | "list";

export class AddPickerStore extends BaseModalStore {
  screen: AddPickerScreen = "add";
  query = "";
  listTemplates: OnboardingTemplateCard[] | null = null;

  constructor(rootStore: RootStore) {
    super(rootStore, {});
    makeObservable(this, {
      screen: observable,
      query: observable,
      listTemplates: observable.ref,
      setQuery: action,
      setListTemplates: action,
      showList: action,
      openListFrom: action,
    });
  }

  setQuery = (query: string) => {
    this.query = query;
  };

  setListTemplates = (cards: OnboardingTemplateCard[]) => {
    this.listTemplates = cards;
  };

  showList = () => {
    this.screen = "list";
    this.query = "";
  };

  openListFrom = (invoker: HTMLElement, fallback?: HTMLElement | null) => {
    this.showList();
    this.openFrom(invoker, fallback);
  };

  protected override prepareToClose(): boolean {
    this.screen = "add";
    this.query = "";
    return true;
  }
}
