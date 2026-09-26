// Board geometry shared by the in-game SVG board and the invite-link preview
// image (api/og.js), so both draw each island identically. Plain JS with a
// relative engine import so it also runs in Vercel functions.

import { topologyFor } from '../../../supabase/functions/_shared/engine/topology.js';

/** SVG units per hex circumradius; boards are laid out in these units. */
export const HEX_UNIT = 100;

/** Corner points of a hexagon as an SVG `points` string (pointy-top by default). */
export function hexPoints(cx, cy, radius, offsetDeg = -90) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i + offsetDeg);
    return `${(cx + radius * Math.cos(a)).toFixed(1)},${(cy + radius * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
}

const cache = new Map();

/**
 * Everything needed to draw one island layout: scaled corners and tile
 * centres, tile/shore outlines, trail segments, harbor badge positions, the
 * surrounding sea and the SVG viewBox.
 */
export function geometryFor(layout = 'classic') {
  const key = layout === 'grand' ? 'grand' : 'classic';
  if (cache.has(key)) return cache.get(key);

  const topology = topologyFor(key);
  const R = HEX_UNIT;
  const V = topology.vertices.map((v) => ({ x: v.x * R, y: v.y * R }));
  const H = topology.hexes.map((h) => ({ x: h.x * R, y: h.y * R, ring: Math.round(Math.hypot(h.x, h.y) / 1.7) }));

  const edgeSegments = topology.edges.map((e) => {
    const [A, B] = e.vertices.map((v) => V[v]);
    const t = 0.17;
    return { x1: A.x + (B.x - A.x) * t, y1: A.y + (B.y - A.y) * t, x2: B.x - (B.x - A.x) * t, y2: B.y - (B.y - A.y) * t };
  });

  const harbor = (edge, distance = 70) => {
    const e = topology.edges[edge];
    const [a, b] = e.vertices.map((v) => V[v]);
    const hex = H[e.hexes[0]];
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dx = mx - hex.x;
    const dy = my - hex.y;
    const len = Math.hypot(dx, dy);
    return { a, b, x: mx + (dx / len) * distance, y: my + (dy / len) * distance };
  };

  let viewBox;
  let frame;
  if (key === 'classic') {
    viewBox = { x: -600, y: -520, width: 1200, height: 1040 };
    frame = { kind: 'polygon', points: hexPoints(0, 0, 575, 0) };
  } else {
    const xs = V.map((p) => p.x);
    const ys = V.map((p) => p.y);
    const pad = 150;
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    viewBox = { x: minX, y: minY, width: Math.max(...xs) + pad - minX, height: Math.max(...ys) + pad - minY };
    const inset = 25;
    frame = { kind: 'rect', x: minX + inset, y: minY + inset, width: viewBox.width - 2 * inset, height: viewBox.height - 2 * inset, rx: 150 };
  }

  const geometry = {
    layout: key,
    topology,
    R,
    V,
    H,
    tilePoints: H.map((h) => hexPoints(h.x, h.y, R * 0.965)),
    shorePoints: H.map((h) => hexPoints(h.x, h.y, R * 1.12)),
    edgeSegments,
    harbor,
    viewBox,
    viewBoxAttr: `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`,
    frame,
  };
  cache.set(key, geometry);
  return geometry;
}
