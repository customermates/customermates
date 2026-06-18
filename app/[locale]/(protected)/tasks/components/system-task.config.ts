import type { TaskType } from "@/generated/prisma";

const SYSTEM_TASK_CONFIG: Record<
  TaskType,
  {
    alertTranslationKey: string;
    linkHref: string;
    nameTranslationKey: string;
  }
> = {
  userPendingAuthorization: {
    alertTranslationKey: "Common.systemTasks.userPendingAuthorization.alert",
    linkHref: "/company/members",
    nameTranslationKey: "Common.systemTasks.userPendingAuthorization.title",
  },
  custom: {
    alertTranslationKey: "",
    linkHref: "",
    nameTranslationKey: "",
  },
};

export function getSystemTaskAlertConfig(taskType: TaskType | null | undefined) {
  if (!taskType || taskType === "custom") return null;

  return {
    translationKey: SYSTEM_TASK_CONFIG[taskType].alertTranslationKey,
    linkHref: SYSTEM_TASK_CONFIG[taskType].linkHref,
  };
}

export function getSystemTaskNameTranslationKey(taskType: TaskType | null | undefined): string | null {
  if (!taskType || taskType === "custom") return null;

  return SYSTEM_TASK_CONFIG[taskType].nameTranslationKey;
}
