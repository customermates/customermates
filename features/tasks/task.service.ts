import { Task, TaskType } from "@/generated/prisma";

import { TenantScoped } from "@/core/decorators/tenant-scoped.decorator";

export abstract class TaskRepo {
  abstract findByType(args: { type: TaskType }): Promise<Task | null>;
  abstract findByTypeAndRelatedUserId(args: { type: TaskType; relatedUserId: string }): Promise<Task | null>;
  abstract create(args: { type: TaskType; userIds?: string[]; relatedUserId?: string; name?: string }): Promise<Task>;
  abstract delete(args: { id: string }): Promise<void>;
}

@TenantScoped
export class TaskService {
  constructor(private repo: TaskRepo) {}

  async findByType(args: Parameters<TaskRepo["findByType"]>[0]) {
    return this.repo.findByType(args);
  }

  async findByTypeAndRelatedUserId(args: Parameters<TaskRepo["findByTypeAndRelatedUserId"]>[0]) {
    return this.repo.findByTypeAndRelatedUserId(args);
  }

  async create(args: Parameters<TaskRepo["create"]>[0]) {
    return this.repo.create(args);
  }

  async delete(args: Parameters<TaskRepo["delete"]>[0]) {
    return this.repo.delete(args);
  }
}
