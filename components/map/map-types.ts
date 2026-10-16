import type { ReactNode } from "react";

export type MapViewPoint = {
  id: string;
  lat: number;
  lon: number;
  group: string | null;
  color: string;
  weight: number | null;
};

export type MapViewLabels = {
  zoomIn: string;
  zoomOut: string;
  reset: string;
  loading: string;
  failed: string;
  attribution: string;
  cluster: (count: number) => string;
  point: (id: string) => string;
};

export type MapViewProps = {
  points: MapViewPoint[];
  label: string;
  labels: MapViewLabels;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  renderPopover: (id: string) => ReactNode;
  className?: string;
};
