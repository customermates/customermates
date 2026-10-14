export const CustomColumnType = {
  currency: "currency",
  date: "date",
  dateRange: "dateRange",
  dateTime: "dateTime",
  dateTimeRange: "dateTimeRange",
  email: "email",
  plain: "plain",
  link: "link",
  phone: "phone",
  singleSelect: "singleSelect",
} as const;

export type CustomColumnType = (typeof CustomColumnType)[keyof typeof CustomColumnType];
