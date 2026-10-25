import type { AddressIssue } from "./address-check";

const PART_NAMES: Readonly<Record<AddressIssue["part"], string>> = {
  street: "street and number",
  postalCode: "postal code",
  city: "city",
  region: "region",
  countryCode: "country",
};

function list(values: readonly string[] | undefined): string {
  return values?.length ? values.join(", ") : "";
}

export function addressIssueText(issue: AddressIssue): string {
  switch (issue.code) {
    case "countryUnknown":
      return "the country code is not an ISO 3166-1 alpha-2 code.";
    case "postalCodeInvalid":
      return `the postal code does not fit the country's format${issue.example ? `, such as ${issue.example}` : ""}.`;
    case "regionInvalid":
      return "the region is not a region code of the country.";
    case "countryMissing":
      return "without a country, the postal code and region could not be checked.";
    case "partMissing":
      return `the ${PART_NAMES[issue.part]} is missing; the country's postal format needs it.`;
    case "regionUnknown":
      return "the region is not one of the country's regions.";
    case "postalCodeRegionMismatch":
      return `the postal code belongs to another region${issue.expected?.length ? `: ${list(issue.expected)}` : ""}.`;
    case "cityMismatch":
      return `the city does not match the postal code, which belongs to ${list(issue.expected)}.`;
  }
}

export function addressIssueSentence(issue: AddressIssue): string {
  const text = addressIssueText(issue);
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}
