export const CustomColumnType = {
  address: "address",
  currency: "currency",
  date: "date",
  dateRange: "dateRange",
  dateTime: "dateTime",
  dateTimeRange: "dateTimeRange",
  file: "file",
  plain: "plain",
  singleSelect: "singleSelect",
} as const;

export type CustomColumnType = (typeof CustomColumnType)[keyof typeof CustomColumnType];
