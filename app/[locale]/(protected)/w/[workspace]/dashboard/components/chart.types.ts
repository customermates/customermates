export type ChartDataPoint = {
  label: string;
  value: number;
  formattedValue?: string;
  axisLabel?: string;
  detail?: string;
  missing?: boolean;
  onSelect?: () => void;
  fill: string;
  color: string;
  labelColor: string;
  strokeColor: string;
};
