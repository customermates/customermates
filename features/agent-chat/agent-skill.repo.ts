export type AgentSkillCatalogEntry = { name: string; title: string; summary: string };

export type AgentSkillContent = { name: string; title: string; instructions: string };

export type AgentSkillDto = {
  id: string;
  name: string;
  title: string;
  summary: string;
  instructions: string;
  enabled: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export type AgentSkillWriteInput = {
  name: string;
  title: string;
  summary: string;
  instructions: string;
  enabled: boolean;
  sortOrder: number;
};

/**
 * Persistence for admin-authored agent workflow "skills" (playbooks), company-scoped.
 * Read methods (listEnabled / getByName) power the agent: a compact catalog is injected
 * into the system prompt and the agent pulls full instructions via the get_skill tool.
 * The list/get/create/update/delete methods back the admin settings UI.
 */
export abstract class AgentSkillRepo {
  abstract listEnabled(): Promise<AgentSkillCatalogEntry[]>;
  abstract getByName(name: string): Promise<AgentSkillContent | null>;
  abstract listAll(): Promise<AgentSkillDto[]>;
  abstract getById(id: string): Promise<AgentSkillDto | null>;
  abstract create(input: AgentSkillWriteInput): Promise<AgentSkillDto>;
  abstract update(id: string, input: AgentSkillWriteInput): Promise<AgentSkillDto | null>;
  abstract delete(id: string): Promise<void>;
}
