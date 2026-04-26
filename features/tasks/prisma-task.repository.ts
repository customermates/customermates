import type { GetWidgetFilterableFieldsTaskRepo } from "../widget/get-widget-filterable-fields.interactor";
import type { TaskRepo as TaskWorkerRepo } from "./task.service";
import type { GetTasksRepo } from "@/features/tasks/get/get-tasks.interactor";
import type { GetTasksConfigurationRepo } from "@/features/tasks/get/get-tasks-configuration.interactor";
import type { CountTasksRepo } from "@/features/tasks/count-user-tasks.interactor";
import type { CountSystemTasksRepo } from "@/features/tasks/count-system-tasks.interactor";
import type { CreateTaskRepo } from "@/features/tasks/upsert/create-task.repo";
import type { UpdateTaskRepo } from "@/features/tasks/upsert/update-task.repo";
import type { DeleteTaskRepo } from "@/features/tasks/delete/delete-task.repo";
import type { GetTaskByIdRepo } from "@/features/tasks/get/get-task-by-id.interactor";
import type { FindTasksByIdsRepo } from "@/features/tasks/find-tasks-by-ids.repo";

import { CustomColumnType, EntityType, TaskType, Resource, Action } from "@/generated/prisma";

import type { Prisma } from "@/generated/prisma";

import { type TaskDto } from "@/features/tasks/task.schema";
import { BaseRepository } from "@/core/base/base-repository";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { type GetQueryParams } from "@/core/base/base-get.schema";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";
import { getCustomColumnRepo } from "@/core/di";
import { type RepoArgs } from "@/core/utils/types";

export class PrismaTaskRepo
  extends BaseRepository
  implements
    TaskWorkerRepo,
    GetTasksRepo,
    GetTasksConfigurationRepo,
    CountTasksRepo,
    CountSystemTasksRepo,
    CreateTaskRepo,
    UpdateTaskRepo,
    DeleteTaskRepo,
    GetTaskByIdRepo,
    GetWidgetFilterableFieldsTaskRepo,
    FindTasksByIdsRepo
{
  private get userScopedSelect() {
    return {
      id: true,
      name: true,
      type: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      users: {
        where: { user: this.accessWhere("user") },
        select: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, email: true } } },
      },
      customFieldValues: {
        select: {
          columnId: true,
          value: true,
        },
      },
    } as const;
  }

  private get companyScopedSelect() {
    return {
      ...this.userScopedSelect,
      users: { select: this.userScopedSelect.users.select },
    };
  }

  getSearchableFields() {
    return [{ field: "name" }];
  }

  getSortableFields() {
    return [
      { field: "createdAt", resolvedFields: ["createdAt"] },
      { field: "updatedAt", resolvedFields: ["updatedAt"] },
    ];
  }

  async getCustomColumns() {
    return getCustomColumnRepo().findByEntityType(EntityType.task);
  }

  async getFilterableFields() {
    if (!this.canAccess(Resource.tasks)) return [];

    const customFields = await getCustomColumnRepo().getFilterableCustomFields(EntityType.task);

    return [
      ...customFields,
      {
        field: FilterFieldKey.userIds,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.userIds],
      },
      { field: FilterFieldKey.updatedAt, operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.updatedAt] },
      { field: FilterFieldKey.createdAt, operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.createdAt] },
    ];
  }

  async getItems(params: GetQueryParams) {
    return this.list({
      model: "task",
      baseWhere: this.accessWhere("task"),
      select: this.userScopedSelect,
      params,
      map: (task: Prisma.TaskGetPayload<{ select: PrismaTaskRepo["userScopedSelect"] }>) => ({
        ...task,
        users: task.users.map((it) => it.user),
      }),
    });
  }

  async getCount(params: GetQueryParams) {
    const { where } = await this.buildQueryArgs(params, this.accessWhere("task"));

    return this.prisma.task.count({ where });
  }

  async getSystemTasksCount(): Promise<number> {
    if (!this.hasPermission(Resource.users, Action.update)) return 0;

    return this.prisma.task.count({
      where: {
        ...this.accessWhere("task"),
        type: TaskType.userPendingAuthorization,
      },
    });
  }

  async findByType(args: Parameters<TaskWorkerRepo["findByType"]>[0]) {
    const { companyId } = this.user;
    const { type } = args;

    return this.prisma.task.findFirst({
      where: {
        type,
        companyId,
      },
    });
  }

  async findByTypeAndRelatedUserId(args: Parameters<TaskWorkerRepo["findByTypeAndRelatedUserId"]>[0]) {
    const { companyId } = this.user;
    const { type, relatedUserId } = args;

    return this.prisma.task.findFirst({ where: { type, companyId, relatedUserId } });
  }

  @Transaction
  async delete(args: Parameters<TaskWorkerRepo["delete"]>[0]) {
    const { companyId } = this.user;
    const { id } = args;

    await Promise.all([
      this.prisma.customFieldValue.deleteMany({ where: { companyId, taskId: id } }),
      this.prisma.taskUser.deleteMany({ where: { taskId: id, companyId } }),
    ]);

    await this.prisma.task.deleteMany({ where: { id, companyId } });
  }

  @Transaction
  async create(args: Parameters<TaskWorkerRepo["create"]>[0]) {
    const { companyId } = this.user;
    const task = await this.prisma.task.create({
      data: {
        type: args.type,
        companyId,
        name: args.name ?? "",
        relatedUserId: args.relatedUserId,
      },
    });

    const promises: Promise<unknown>[] = [];

    if (args.userIds && args.userIds.length > 0) {
      promises.push(
        this.prisma.taskUser.createMany({
          data: args.userIds.map((userId) => ({
            taskId: task.id,
            userId,
            companyId,
          })),
        }),
      );
    }

    const customColumns = await getCustomColumnRepo().findByEntityType(EntityType.task);
    const defaultCustomFieldValues = customColumns
      .filter(
        (column): column is Extract<typeof column, { type: typeof CustomColumnType.singleSelect }> =>
          column.type === CustomColumnType.singleSelect && column.options?.options?.some((opt) => opt.isDefault),
      )
      .map((column) => {
        const defaultOption = column.options.options.find((opt) => opt.isDefault);
        return defaultOption
          ? {
              columnId: column.id,
              value: defaultOption.value,
            }
          : null;
      })
      .filter((cfv): cfv is { columnId: string; value: string } => cfv !== null);

    if (defaultCustomFieldValues.length > 0)
      promises.push(getCustomColumnRepo().replaceValuesForEntity(EntityType.task, task.id, defaultCustomFieldValues));

    await Promise.all(promises);

    return task;
  }

  @Transaction
  async createTaskOrThrow(args: RepoArgs<CreateTaskRepo, "createTaskOrThrow">) {
    const { companyId } = this.user;
    const { userIds, customFieldValues, name, notes } = args;

    const data = {
      name,
      notes: notes,
      companyId,
      type: TaskType.custom,
    };

    const task = await this.prisma.task.create({
      data,
      select: {
        id: true,
      },
    });

    const promises: Promise<unknown>[] = [];

    if (userIds.length > 0) {
      promises.push(
        this.prisma.taskUser.createMany({
          data: userIds.map((userId) => ({
            taskId: task.id,
            userId,
            companyId,
          })),
        }),
      );
    }

    if (customFieldValues.length > 0)
      promises.push(getCustomColumnRepo().replaceValuesForEntity(EntityType.task, task.id, customFieldValues));

    await Promise.all(promises);

    const createdTask = await this.prisma.task.findFirstOrThrow({
      where: { id: task.id, ...this.accessWhere("task") },
      select: this.userScopedSelect,
    });

    const res = {
      ...createdTask,
      users: createdTask.users.map((it) => it.user),
    };

    return res;
  }

  @Transaction
  async updateTaskOrThrow(args: RepoArgs<UpdateTaskRepo, "updateTaskOrThrow">) {
    const { companyId } = this.user;
    const { id, userIds, customFieldValues, ...taskData } = args;

    const data: Prisma.TaskUpdateManyArgs["data"] = { companyId };

    if (taskData.name !== undefined) {
      const existingTask = await this.prisma.task.findFirstOrThrow({
        where: { id, ...this.accessWhere("task") },
        select: { type: true },
      });

      if (existingTask.type === TaskType.custom) data.name = taskData.name;
    }

    if (taskData.notes !== undefined) data.notes = taskData.notes;

    await this.prisma.task.updateMany({
      where: { id, ...this.accessWhere("task") },
      data,
    });

    const deletePromises: Promise<unknown>[] = [];
    const createPromises: Promise<unknown>[] = [];

    if (userIds !== undefined) {
      deletePromises.push(
        this.prisma.taskUser.deleteMany({
          where: { taskId: id, companyId, user: { is: this.accessWhere("user") } },
        }),
      );

      if (userIds !== null && userIds.length > 0) {
        createPromises.push(
          this.prisma.taskUser.createMany({
            data: userIds.map((userId) => ({
              taskId: id,
              userId,
              companyId,
            })),
          }),
        );
      }
    }

    if (customFieldValues !== undefined) {
      if (customFieldValues === null)
        createPromises.push(getCustomColumnRepo().deleteValuesForEntity(EntityType.task, id));
      else createPromises.push(getCustomColumnRepo().replaceValuesForEntity(EntityType.task, id, customFieldValues));
    }

    await Promise.all(deletePromises);
    await Promise.all(createPromises);

    const updatedTask = await this.prisma.task.findFirstOrThrow({
      where: { id, ...this.accessWhere("task") },
      select: this.userScopedSelect,
    });

    const res = {
      ...updatedTask,
      users: updatedTask.users.map((it) => it.user),
    };

    return res;
  }

  @Transaction
  async deleteTaskOrThrow(id: string) {
    const task = await this.prisma.task.findFirstOrThrow({
      where: { id, ...this.accessWhere("task") },
      select: this.userScopedSelect,
    });

    const taskDto: TaskDto = {
      ...task,
      users: task.users.map((it) => it.user),
    };

    await this.prisma.task.deleteMany({ where: { id, ...this.accessWhere("task") } });

    return taskDto;
  }

  async findIds(ids: Set<string>): Promise<Set<string>> {
    if (ids.size === 0) return new Set();

    const tasks = await this.prisma.task.findMany({
      where: {
        id: { in: Array.from(ids) },
        ...this.accessWhere("task"),
      },
      select: { id: true },
    });

    return new Set(tasks.map((task) => task.id));
  }

  async findSystemTaskIds(ids: Set<string>): Promise<Set<string>> {
    if (ids.size === 0) return new Set();

    const tasks = await this.prisma.task.findMany({
      where: {
        id: { in: Array.from(ids) },
        ...this.accessWhere("task"),
        type: { not: TaskType.custom },
      },
      select: { id: true },
    });

    return new Set(tasks.map((task) => task.id));
  }

  async getTaskById(id: string) {
    const task = await this.prisma.task.findFirst({
      where: {
        id,
        ...this.accessWhere("task"),
      },
      select: this.userScopedSelect,
    });

    if (!task) return null;

    return {
      ...task,
      users: task.users.map((it) => it.user),
    };
  }

  async getTaskByIdOrThrow(id: string) {
    const task = await this.prisma.task.findFirstOrThrow({
      where: {
        id,
        ...this.accessWhere("task"),
      },
      select: this.userScopedSelect,
    });

    return {
      ...task,
      users: task.users.map((it) => it.user),
    };
  }
}
