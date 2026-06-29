import type { AgentPageContext } from "../agent-chat.types";

import { makeAutoObservable } from "mobx";

/**
 * Global open/close + context state for the assistant slide-over.
 *
 * Deliberately standalone (NOT a BaseModalStore): the protected layout calls
 * closeAllModals() on every navigation, and the assistant is meant to stay open
 * across pages while its page-context updates. It therefore does not register
 * with the modal registry.
 */
export class AgentChatStore {
  isOpen = false;
  activeConversationId: string | null = null;
  focusedEntity: NonNullable<AgentPageContext["entity"]> | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  open = () => {
    this.isOpen = true;
  };

  close = () => {
    this.isOpen = false;
  };

  toggle = () => {
    this.isOpen = !this.isOpen;
  };

  setActiveConversation = (id: string | null) => {
    this.activeConversationId = id;
  };

  startNewConversation = () => {
    this.activeConversationId = null;
  };

  setFocusedEntity = (entity: NonNullable<AgentPageContext["entity"]> | null) => {
    this.focusedEntity = entity;
  };
}
