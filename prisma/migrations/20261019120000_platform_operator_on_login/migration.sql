-- Platform operator access moves from workspace memberships to the login.
ALTER TABLE "AuthUser" ADD COLUMN "isPlatformOperator" BOOLEAN NOT NULL DEFAULT false;

-- A login keeps access exactly when it had it: an active membership with the flag.
UPDATE "AuthUser" AS login
SET "isPlatformOperator" = true
WHERE EXISTS (
  SELECT 1
  FROM "User" AS member
  WHERE lower(member."email") = lower(login."email")
    AND member."isPlatformOperator"
    AND member."status" = 'active'
    AND member."leftAt" IS NULL
);

ALTER TABLE "User" DROP COLUMN "isPlatformOperator";
