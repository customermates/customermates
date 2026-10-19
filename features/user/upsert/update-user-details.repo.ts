import type { StoredUserProfileData, UpdateUserDetailsData } from "./update-user-details.interactor";

type OtherMembershipProfile = {
  id: string;
  companyId: string;
  firstName: string;
  lastName: string;
};

export abstract class UpdateUserDetailsRepo {
  abstract updateDetails(args: UpdateUserDetailsData): Promise<StoredUserProfileData>;
  abstract applyPersonalProfileToOtherMembershipsUnscoped(args: {
    email: string;
    exceptUserId: string;
    profile: Partial<StoredUserProfileData>;
  }): Promise<OtherMembershipProfile[]>;
}
