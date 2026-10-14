import type { StoredUserProfileData, UpdateUserDetailsData } from "./update-user-details.interactor";

export abstract class UpdateUserDetailsRepo {
  abstract updateDetails(args: UpdateUserDetailsData): Promise<StoredUserProfileData>;
}
