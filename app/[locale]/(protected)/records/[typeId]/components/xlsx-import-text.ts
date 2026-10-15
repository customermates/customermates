"use client";

import type { XlsxIssue } from "@/features/data-transfer/import/xlsx/xlsx-import-plan";
import type { XlsxFileProblem } from "@/features/data-transfer/import/xlsx/xlsx-workbook";
import type { XlsxWizardStep } from "./xlsx-import-wizard.store";

import { useTranslations } from "next-intl";

export function useXlsxImportText() {
  const t = useTranslations();

  const issue = (entry: XlsxIssue): string => {
    const values = { value: entry.value ?? "" };
    switch (entry.code) {
      case "required":
        return t("DataTransfer.xlsxImport.issues.required", values);
      case "invalidNumber":
        return t("DataTransfer.xlsxImport.issues.invalidNumber", values);
      case "currencyMismatch":
        return t("DataTransfer.xlsxImport.issues.currencyMismatch", values);
      case "invalidDate":
        return t("DataTransfer.xlsxImport.issues.invalidDate", values);
      case "invalidBoolean":
        return t("DataTransfer.xlsxImport.issues.invalidBoolean", values);
      case "invalidEmail":
        return t("DataTransfer.xlsxImport.issues.invalidEmail", values);
      case "invalidUrl":
        return t("DataTransfer.xlsxImport.issues.invalidUrl", values);
      case "invalidChannel":
        return t("DataTransfer.xlsxImport.issues.invalidChannel", values);
      case "invalidValue":
        return t("DataTransfer.xlsxImport.issues.invalidValue", values);
      case "unknownOption":
        return t("DataTransfer.xlsxImport.issues.unknownOption", values);
      case "unknownMember":
        return t("DataTransfer.xlsxImport.issues.unknownMember", values);
      case "ambiguousMember":
        return t("DataTransfer.xlsxImport.issues.ambiguousMember", values);
      case "unknownRecord":
        return t("DataTransfer.xlsxImport.issues.unknownRecord", values);
      case "ambiguousRecord":
        return t("DataTransfer.xlsxImport.issues.ambiguousRecord", values);
      case "tooManyValues":
        return t("DataTransfer.xlsxImport.issues.tooManyValues");
      case "invalidRecordId":
        return t("DataTransfer.xlsxImport.issues.invalidRecordId", values);
      case "noMatch":
        return t("DataTransfer.xlsxImport.issues.noMatch");
      case "ambiguousMatch":
        return t("DataTransfer.xlsxImport.issues.ambiguousMatch");
      case "duplicateMatch":
        return t("DataTransfer.xlsxImport.issues.duplicateMatch");
      case "missingMatchValue":
        return t("DataTransfer.xlsxImport.issues.missingMatchValue");
      case "restricted":
        return t("DataTransfer.xlsxImport.issues.restricted");
      case "lookupUnavailable":
        return t("DataTransfer.xlsxImport.issues.lookupUnavailable", values);
      case "fileNotImportable":
        return t("DataTransfer.xlsxImport.issues.fileNotImportable");
    }
  };

  const step = (value: XlsxWizardStep): string => {
    switch (value) {
      case "file":
        return t("DataTransfer.xlsxImport.steps.file");
      case "mapping":
        return t("DataTransfer.xlsxImport.steps.mapping");
      case "preview":
        return t("DataTransfer.xlsxImport.steps.preview");
      case "mode":
        return t("DataTransfer.xlsxImport.steps.mode");
      case "result":
        return t("DataTransfer.xlsxImport.steps.result");
    }
  };

  const problem = (value: XlsxFileProblem): string => {
    switch (value) {
      case "tooLarge":
        return t("DataTransfer.xlsxImport.problems.tooLarge");
      case "tooManyRows":
        return t("DataTransfer.xlsxImport.problems.tooManyRows");
      case "empty":
        return t("DataTransfer.xlsxImport.problems.empty");
      case "unreadable":
        return t("DataTransfer.xlsxImport.problems.unreadable");
    }
  };

  return { issue, step, problem };
}
