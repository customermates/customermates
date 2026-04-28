import type { RootStore } from "@/core/stores/root.store";
import type { TaskDto } from "@/features/tasks/task.schema";
import type { CreateTaskData } from "@/features/tasks/upsert/create-task.interactor";

import { computed, makeObservable } from "mobx";
import { Resource, TaskType } from "@/generated/prisma";

import { deleteTaskAction, getTaskByIdAction, createTaskAction, updateTaskAction } from "../actions";

import { getSystemTaskAlertConfig, getSystemTaskNameTranslationKey } from "./system-task.config";

import { BaseCustomColumnEntityModalStore } from "@/core/base/base-custom-column-entity-modal.store";

export class TaskDetailStore extends BaseCustomColumnEntityModalStore<CreateTaskData & { id?: string }, TaskDto> {
  constructor(public readonly rootStore: RootStore) {
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
        create: createTaskAction,
        update: updateTaskAction,
        delete: deleteTaskAction,
      },
    );

    makeObservable(this, {
      isCustomTask: computed,
      systemTaskAlertConfig: computed,
    });
  }

  get isCustomTask(): boolean {
    return this.fetchedEntity?.type === TaskType.custom;
  }

  get systemTaskAlertConfig() {
    return getSystemTaskAlertConfig(this.fetchedEntity?.type);
  }

  protected initFormWithCustomFieldValues(entity?: TaskDto) {
    const baseData = super.initFormWithCustomFieldValues(entity);

    if (entity) {
      const nameTranslationKey = getSystemTaskNameTranslationKey(entity.type);
      const displayName = nameTranslationKey
        ? this.rootStore.localeStore.getTranslation(nameTranslationKey)
        : (entity.name ?? "");

      return {
        ...entity,
        ...baseData,
        userIds: entity.users.map((user) => user.id),
        contactIds: entity.contacts.map((contact) => contact.id),
        organizationIds: entity.organizations.map((organization) => organization.id),
        dealIds: entity.deals.map((deal) => deal.id),
        serviceIds: entity.services.map((service) => service.id),
        name: displayName,
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
