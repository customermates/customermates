import type { TaskType } from "@/generated/prisma";

export const SYSTEM_TASK_CONFIG: Record<
  TaskType,
  {
    alertTranslationKey: string;
    linkHref: string;
    nameTranslationKey: string;
  }
> = {
  userPendingAuthorization: {
    alertTranslationKey: "Common.systemTasks.userPendingAuthorization.alert",
    linkHref: "/company",
    nameTranslationKey: "Common.systemTasks.userPendingAuthorization.title",
  },
  companyOnboarding: {
    alertTranslationKey: "Common.systemTasks.companyOnboarding.alert",
    linkHref: "/company",
    nameTranslationKey: "Common.systemTasks.companyOnboarding.title",
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
