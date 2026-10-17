import type { CountryCode } from "@/generated/prisma";
import type { StoredUserProfileData, UpdateUserDetailsData } from "./update-user-details.interactor";

export type OtherMembershipProfile = {
  id: string;
  companyId: string;
  firstName: string;
  lastName: string;
  country: CountryCode;
};

export abstract class UpdateUserDetailsRepo {
  abstract updateDetails(args: UpdateUserDetailsData): Promise<StoredUserProfileData>;
  abstract applyPersonalProfileToOtherMembershipsUnscoped(args: {
    email: string;
    exceptUserId: string;
    profile: Partial<StoredUserProfileData>;
  }): Promise<OtherMembershipProfile[]>;
}
