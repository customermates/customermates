import { AggregationType } from "@/generated/prisma";

export function isCurrencyAggregation(aggregationType: AggregationType | undefined): boolean {
  return aggregationType === AggregationType.dealValue || aggregationType === AggregationType.dealWeightedValue;
}
