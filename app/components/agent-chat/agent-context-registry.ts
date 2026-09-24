import type { AgentContextAttachment } from "@/ee/agent-chat/agent-context";

import { makeAutoObservable, runInAction } from "mobx";

import { agentContextAttachmentKey } from "@/ee/agent-chat/agent-context";

export type AgentContextCandidate = {
  context: AgentContextAttachment;
  pageRoute?: string;
  starter?: string;
};

type RegisteredCandidates = {
  pathname: string;
  readCandidates: () => readonly AgentContextCandidate[];
};

function normalizePathname(pathname: string): string {
  const withoutQuery = pathname.split(/[?#]/, 1)[0] || "/";
  return withoutQuery === "/" ? withoutQuery : withoutQuery.replace(/\/+$/, "");
}

export class AgentContextRegistry {
  private registrations = new Map<number, RegisteredCandidates>();
  private nextRegistrationId = 0;
  private revision = 0;

  constructor() {
    makeAutoObservable<this, "registrations" | "nextRegistrationId" | "revision">(
      this,
      {
        registrations: false,
        nextRegistrationId: false,
        revision: true,
        candidates: false,
      },
      { autoBind: true },
    );
  }

  register(pathname: string, readCandidates: () => readonly AgentContextCandidate[]): () => void {
    const registrationId = this.nextRegistrationId++;
    this.registrations.set(registrationId, {
      pathname: normalizePathname(pathname),
      readCandidates,
    });
    this.revision += 1;

    return () => {
      runInAction(() => {
        if (!this.registrations.delete(registrationId)) return;
        this.revision += 1;
      });
    };
  }

  candidates(pathname: string): AgentContextCandidate[] {
    void this.revision;

    const normalizedPathname = normalizePathname(pathname);
    const byKey = new Map<string, AgentContextCandidate>();

    for (const registration of this.registrations.values()) {
      if (registration.pathname !== normalizedPathname) continue;
      for (const candidate of registration.readCandidates())
        byKey.set(agentContextAttachmentKey(candidate.context), candidate);
    }

    return [...byKey.values()];
  }
}
