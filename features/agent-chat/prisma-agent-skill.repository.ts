import type {
  AgentSkillCatalogEntry,
  AgentSkillContent,
  AgentSkillDto,
  AgentSkillRepo,
  AgentSkillWriteInput,
} from "./agent-skill.repo";

import { BaseRepository } from "@/core/base/base-repository";

const SKILL_SELECT = {
  id: true,
  name: true,
  title: true,
  summary: true,
  instructions: true,
  enabled: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} as const;

const SKILL_ORDER = [{ sortOrder: "asc" as const }, { title: "asc" as const }];

export class PrismaAgentSkillRepo extends BaseRepository implements AgentSkillRepo {
  listEnabled(): Promise<AgentSkillCatalogEntry[]> {
    return this.prisma.agentSkill.findMany({
      where: { companyId: this.companyId, enabled: true },
      orderBy: SKILL_ORDER,
      select: { name: true, title: true, summary: true },
    });
  }

  getByName(name: string): Promise<AgentSkillContent | null> {
    return this.prisma.agentSkill.findFirst({
      where: { companyId: this.companyId, name, enabled: true },
      select: { name: true, title: true, instructions: true },
    });
  }

  listAll(): Promise<AgentSkillDto[]> {
    return this.prisma.agentSkill.findMany({
      where: { companyId: this.companyId },
      orderBy: SKILL_ORDER,
      select: SKILL_SELECT,
    });
  }

  getById(id: string): Promise<AgentSkillDto | null> {
    return this.prisma.agentSkill.findFirst({
      where: { id, companyId: this.companyId },
      select: SKILL_SELECT,
    });
  }

  create(input: AgentSkillWriteInput): Promise<AgentSkillDto> {
    return this.prisma.agentSkill.create({
      data: { companyId: this.companyId, ...input },
      select: SKILL_SELECT,
    });
  }

  async update(id: string, input: AgentSkillWriteInput): Promise<AgentSkillDto | null> {
    await this.prisma.agentSkill.updateMany({
      where: { id, companyId: this.companyId },
      data: input,
    });
    return this.getById(id);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.agentSkill.deleteMany({ where: { id, companyId: this.companyId } });
  }
}
