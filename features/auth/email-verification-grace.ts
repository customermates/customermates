const EMAIL_VERIFICATION_GRACE_MS = 24 * 60 * 60 * 1000;

type GraceCheckUser = {
  emailVerified?: boolean | null;
  createdAt: Date | string;
};

export function mustVerifyEmail(user: GraceCheckUser): boolean {
  if (user.emailVerified) return false;
  const createdAt = typeof user.createdAt === "string" ? new Date(user.createdAt) : user.createdAt;
  return createdAt.getTime() <= Date.now() - EMAIL_VERIFICATION_GRACE_MS;
}
