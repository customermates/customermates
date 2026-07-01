import { describe, it, expect, vi } from "vitest";
import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
  getLocale: () => Promise.resolve("en"),
}));

import type { AgentSkillDto } from "../agent-skill.repo";

import { ListAgentSkillsInteractor } from "../list-agent-skills.interactor";
import { GetAgentSkillByIdInteractor } from "../get-agent-skill-by-id.interactor";
import { CreateAgentSkillInteractor } from "../create-agent-skill.interactor";
import { UpdateAgentSkillInteractor } from "../update-agent-skill.interactor";
import { DeleteAgentSkillInteractor } from "../delete-agent-skill.interactor";

const ID = "00000000-0000-4000-8000-000000000001";

const DTO: AgentSkillDto = {
  id: ID,
  name: "import_data",
  title: "Import records",
  summary: "Import records from a file",
  instructions: "Do the whole import in one run_code call.",
  enabled: true,
  sortOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeRepo(overrides: Record<string, ReturnType<typeof vi.fn>> = {}) {
  return {
    listAll: vi.fn().mockResolvedValue([DTO]),
    getById: vi.fn().mockResolvedValue(DTO),
    create: vi.fn().mockResolvedValue(DTO),
    update: vi.fn().mockResolvedValue(DTO),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const VALID_CREATE = {
  name: "new_skill",
  title: "New skill",
  summary: "A new skill",
  instructions: "Some instructions",
  enabled: true,
  sortOrder: 2,
};

describe("Agent skill management interactors", () => {
  describe("ListAgentSkillsInteractor", () => {
    it("returns all skills from the repo", async () => {
      const repo = makeRepo();
      const result = await new ListAgentSkillsInteractor(repo as never).invoke();
      expect(result).toMatchObject({ ok: true, data: [DTO] });
      expect(repo.listAll).toHaveBeenCalledTimes(1);
    });
  });

  describe("GetAgentSkillByIdInteractor", () => {
    it("returns the skill for a valid id", async () => {
      const repo = makeRepo();
      const result = await new GetAgentSkillByIdInteractor(repo as never).invoke({ id: ID });
      expect(result).toMatchObject({ ok: true, data: DTO });
      expect(repo.getById).toHaveBeenCalledWith(ID);
    });

    it("returns ok:false for a non-uuid id", async () => {
      const repo = makeRepo();
      const result = await new GetAgentSkillByIdInteractor(repo as never).invoke({ id: "not-a-uuid" } as never);
      expect(result).toMatchObject({ ok: false });
      expect(repo.getById).not.toHaveBeenCalled();
    });
  });

  describe("CreateAgentSkillInteractor", () => {
    it("creates a skill from valid input", async () => {
      const repo = makeRepo();
      const result = await new CreateAgentSkillInteractor(repo as never).invoke(VALID_CREATE);
      expect(result).toMatchObject({ ok: true, data: DTO });
      expect(repo.create).toHaveBeenCalledTimes(1);
    });

    it("rejects an invalid name (uppercase / spaces)", async () => {
      const repo = makeRepo();
      const result = await new CreateAgentSkillInteractor(repo as never).invoke({
        ...VALID_CREATE,
        name: "Not A Slug",
      });
      expect(result).toMatchObject({ ok: false });
      if (!result.ok) expect(result.error.issues[0]?.path).toEqual(["name"]);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it("rejects empty instructions", async () => {
      const repo = makeRepo();
      const result = await new CreateAgentSkillInteractor(repo as never).invoke({ ...VALID_CREATE, instructions: "" });
      expect(result).toMatchObject({ ok: false });
      expect(repo.create).not.toHaveBeenCalled();
    });

    it("ignores a body-supplied companyId (tenant scoping): repo.create gets only whitelisted fields", async () => {
      const repo = makeRepo();
      await new CreateAgentSkillInteractor(repo as never).invoke({
        ...VALID_CREATE,
        companyId: "attacker-company",
        id: "attacker-id",
      } as never);
      const passed = repo.create.mock.calls[0]?.[0] ?? {};
      expect(passed).not.toHaveProperty("companyId");
      expect(passed).not.toHaveProperty("id");
      expect(passed).toMatchObject({ name: VALID_CREATE.name });
    });
  });

  describe("UpdateAgentSkillInteractor", () => {
    it("updates a skill and passes the path id plus whitelisted fields", async () => {
      const repo = makeRepo();
      const result = await new UpdateAgentSkillInteractor(repo as never).invoke({ id: ID, ...VALID_CREATE });
      expect(result).toMatchObject({ ok: true, data: DTO });
      expect(repo.update).toHaveBeenCalledWith(ID, expect.objectContaining({ name: VALID_CREATE.name }));
      const passedInput = repo.update.mock.calls[0]?.[1] ?? {};
      expect(passedInput).not.toHaveProperty("companyId");
      expect(passedInput).not.toHaveProperty("id");
    });

    it("returns ok:true with null data when the skill is not in the tenant (repo update returns null)", async () => {
      const repo = makeRepo({ update: vi.fn().mockResolvedValue(null) });
      const result = await new UpdateAgentSkillInteractor(repo as never).invoke({ id: ID, ...VALID_CREATE });
      expect(result).toMatchObject({ ok: true, data: null });
    });

    it("rejects a non-uuid id", async () => {
      const repo = makeRepo();
      const result = await new UpdateAgentSkillInteractor(repo as never).invoke({
        id: "nope",
        ...VALID_CREATE,
      } as never);
      expect(result).toMatchObject({ ok: false });
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe("DeleteAgentSkillInteractor", () => {
    it("deletes by id and returns the id", async () => {
      const repo = makeRepo();
      const result = await new DeleteAgentSkillInteractor(repo as never).invoke({ id: ID });
      expect(result).toMatchObject({ ok: true, data: { id: ID } });
      expect(repo.delete).toHaveBeenCalledWith(ID);
    });

    it("rejects a non-uuid id", async () => {
      const repo = makeRepo();
      const result = await new DeleteAgentSkillInteractor(repo as never).invoke({ id: "bad" } as never);
      expect(result).toMatchObject({ ok: false });
      expect(repo.delete).not.toHaveBeenCalled();
    });
  });
});
