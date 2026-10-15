export abstract class LeaveWorkspaceRepo {
  abstract isPlatformOperatorCompanyWide(userId: string): Promise<boolean>;
  abstract leaveCompanyWide(userId: string): Promise<void>;
}
