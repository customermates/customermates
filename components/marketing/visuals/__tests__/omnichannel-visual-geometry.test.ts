import { describe, expect, it } from "vitest";

import {
  OMNICHANNEL_PROVIDER_ORDER,
  OMNICHANNEL_SPLIT_GEOMETRY,
  createOmnichannelSplitGeometry,
  omnichannelBoxCenter,
  omnichannelBoxesOverlap,
  type OmnichannelBox,
  type OmnichannelPoint,
} from "../omnichannel-visual-geometry";

function pointIsOnBoxBoundary(point: OmnichannelPoint, box: OmnichannelBox) {
  const tolerance = 0.000001;
  const approximatelyEqual = (left: number, right: number) => Math.abs(left - right) <= tolerance;
  const withinHorizontalBounds = point.x >= box.x - tolerance && point.x <= box.x + box.width + tolerance;
  const withinVerticalBounds = point.y >= box.y - tolerance && point.y <= box.y + box.height + tolerance;
  const touchesVerticalEdge = approximatelyEqual(point.x, box.x) || approximatelyEqual(point.x, box.x + box.width);
  const touchesHorizontalEdge = approximatelyEqual(point.y, box.y) || approximatelyEqual(point.y, box.y + box.height);

  return (touchesVerticalEdge && withinVerticalBounds) || (touchesHorizontalEdge && withinHorizontalBounds);
}

function boxIsInside(inner: OmnichannelBox, outer: OmnichannelBox) {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

describe("omnichannel visual geometry", () => {
  it("keeps the approved seven-provider clockwise order deterministic", () => {
    expect(OMNICHANNEL_PROVIDER_ORDER).toEqual([
      "gmail",
      "outlook",
      "linkedin",
      "whatsapp",
      "telegram",
      "instagram",
      "imap",
    ]);
    expect(createOmnichannelSplitGeometry()).toEqual(createOmnichannelSplitGeometry());
    expect(OMNICHANNEL_SPLIT_GEOMETRY).toEqual(createOmnichannelSplitGeometry());
    expect(OMNICHANNEL_SPLIT_GEOMETRY.satellites[0]?.center).toEqual({
      x: 50,
      y: 10,
    });
  });

  it("keeps every satellite inside the artboard and clear of the centred record and its neighbours", () => {
    const { record, satellites, viewBox } = OMNICHANNEL_SPLIT_GEOMETRY;

    expect(omnichannelBoxCenter(record)).toEqual({ x: 50, y: 50 });
    for (const [index, satellite] of satellites.entries()) {
      expect(boxIsInside(satellite.box, viewBox)).toBe(true);
      expect(omnichannelBoxesOverlap(satellite.box, record)).toBe(false);

      for (const neighbour of satellites.slice(index + 1))
        expect(omnichannelBoxesOverlap(satellite.box, neighbour.box)).toBe(false);
    }
  });

  it("starts and ends every radial connector on the exact source and record boundaries", () => {
    const { connectors, record, satellites } = OMNICHANNEL_SPLIT_GEOMETRY;

    expect(connectors).toHaveLength(OMNICHANNEL_PROVIDER_ORDER.length);
    for (const connector of connectors) {
      const satellite = satellites.find(({ provider }) => provider === connector.provider);
      expect(satellite).toBeDefined();
      if (!satellite) continue;

      expect(pointIsOnBoxBoundary(connector.source, satellite.box)).toBe(true);
      expect(pointIsOnBoxBoundary(connector.target, record)).toBe(true);

      const satelliteCenter = satellite.center;
      const recordCenter = omnichannelBoxCenter(record);
      const centerDelta = {
        x: recordCenter.x - satelliteCenter.x,
        y: recordCenter.y - satelliteCenter.y,
      };
      const connectorDelta = {
        x: connector.target.x - connector.source.x,
        y: connector.target.y - connector.source.y,
      };
      const crossProduct = centerDelta.x * connectorDelta.y - centerDelta.y * connectorDelta.x;

      expect(Math.abs(crossProduct)).toBeLessThan(0.0001);
    }
  });
});
