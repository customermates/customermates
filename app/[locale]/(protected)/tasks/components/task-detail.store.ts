import type { RootStore } from "@/core/stores/root.store";
import type { TaskDto } from "@/features/tasks/task.schema";
import type { CreateTaskData } from "@/features/tasks/upsert/create-task.interactor";

import { computed, makeObservable } from "mobx";
import { Resource, TaskType } from "@/generated/prisma";

import { deleteTaskAction, getTaskByIdAction, createTaskAction, updateTaskAction } from "../actions";

import { getSystemTaskAlertConfig, getSystemTaskNameTranslationKey } from "./system-task.config";

import { BaseCustomColumnEntityModalStore } from "@/core/base/base-custom-column-entity-modal.store";

type TaskFormData = Omit<CreateTaskData, "name"> & { name?: string; id?: string };

export class TaskDetailStore extends BaseCustomColumnEntityModalStore<TaskFormData, TaskDto> {
  constructor(rootStore: RootStore) {
    super(
      rootStore,
      {
        name: "",
        notes: null,
        userIds: [],
        contactIds: [],
        organizationIds: [],
        dealIds: [],
        serviceIds: [],
        customFieldValues: [],
      },
      Resource.tasks,
      rootStore.tasksStore,
      {
        getById: getTaskByIdAction,
        create: (data: TaskFormData) => createTaskAction({ ...data, name: data.name ?? "" }),
        update: updateTaskAction,
        delete: deleteTaskAction,
      },
    );

    makeObservable(this, {
      isCustomTask: computed,
      systemTaskAlertConfig: computed,
      systemTaskDisplayName: computed,
    });
  }

  get isCustomTask(): boolean {
    return this.fetchedEntity?.type === TaskType.custom;
  }

  get systemTaskAlertConfig() {
    return getSystemTaskAlertConfig(this.fetchedEntity?.type);
  }

  get systemTaskDisplayName(): string {
    const nameTranslationKey = getSystemTaskNameTranslationKey(this.fetchedEntity?.type);

    return nameTranslationKey ? this.t(nameTranslationKey) : (this.fetchedEntity?.name ?? "");
  }

  protected initFormWithCustomFieldValues(entity?: TaskDto) {
    const baseData = super.initFormWithCustomFieldValues(entity);

    if (entity) {
      return {
        ...entity,
        ...baseData,
        userIds: entity.users.map((user) => user.id),
        contactIds: entity.contacts.map((contact) => contact.id),
        organizationIds: entity.organizations.map((organization) => organization.id),
        dealIds: entity.deals.map((deal) => deal.id),
        serviceIds: entity.services.map((service) => service.id),
        name: entity.type === TaskType.custom ? (entity.name ?? "") : undefined,
      };
    }

    return {
      ...baseData,
      name: "",
      notes: null,
      userIds: [],
      contactIds: [],
      organizationIds: [],
      dealIds: [],
      serviceIds: [],
    };
  }
}
