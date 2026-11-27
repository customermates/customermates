UPDATE "MessagingMessage" AS message
SET "folderIds" = account."sentFolderIds",
    "isHidden" = false
FROM "ConnectedAccount" AS account
WHERE account."id" = message."connectedAccountId"
  AND account."companyId" = message."companyId"
  AND message."provider" IN ('google', 'outlook', 'mail')
  AND message."direction" = 'outbound'
  AND message."origin" = 'unipile'
  AND NOT message."isDraft"
  AND cardinality(message."folderIds") = 0
  AND cardinality(account."sentFolderIds") > 0;
