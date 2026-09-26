// Board geometry shared by the in-game SVG board and the invite-link preview
// image (api/og.js), so both draw the island identically. Plain JS with a
// relative engine import so it also runs in Vercel functions.

import { TOPOLOGY } from '../../../supabase/functions/_shared/engine/topology.js';

/** SVG units per hex circumradius; the board's viewBox is laid out in these units. */
export const HEX_UNIT = 100;
export const BOARD_VIEWBOX = { x: -600, y: -520, width: 1200, height: 1040 };

/** Corner points of a hexagon as an SVG `points` string (pointy-top by default). */
export function hexPoints(cx, cy, radius, offsetDeg = -90) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i + offsetDeg);
    return `${(cx + radius * Math.cos(a)).toFixed(1)},${(cy + radius * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
}

export const hexCenter = (id) => ({ x: TOPOLOGY.hexes[id].x * HEX_UNIT, y: TOPOLOGY.hexes[id].y * HEX_UNIT });
export const vertexPoint = (id) => ({ x: TOPOLOGY.vertices[id].x * HEX_UNIT, y: TOPOLOGY.vertices[id].y * HEX_UNIT });

/** Where a harbor's badge sits: out to sea from the middle of its coastal edge. */
export function harborBadge(edge, distance = 70) {
  const e = TOPOLOGY.edges[edge];
  const [a, b] = e.vertices.map(vertexPoint);
  const hex = hexCenter(e.hexes[0]);
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = mx - hex.x;
  const dy = my - hex.y;
  const len = Math.hypot(dx, dy);
  return { a, b, x: mx + (dx / len) * distance, y: my + (dy / len) * distance };
}
