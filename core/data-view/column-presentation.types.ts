export const CustomColumnType = {
  address: "address",
  currency: "currency",
  date: "date",
  dateRange: "dateRange",
  dateTime: "dateTime",
  dateTimeRange: "dateTimeRange",
  email: "email",
  file: "file",
  plain: "plain",
  link: "link",
  phone: "phone",
  singleSelect: "singleSelect",
} as const;

export type CustomColumnType = (typeof CustomColumnType)[keyof typeof CustomColumnType];
