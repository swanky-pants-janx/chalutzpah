// A flat, text-free rendering of the island for the invite preview image
// (numbers are drawn on top by api/og.js, which has the fonts).

import { geometryFor } from '../../src/components/board/geometry.js';
import { RESOURCE_COLORS, TERRAIN_COLORS } from '../../src/lib/theme.js';

export function boardSvg(board) {
  const G = geometryFor(board.layout);
  const out = [];
  if (G.frame.kind === 'polygon') {
    out.push(`<polygon points="${G.frame.points}" fill="#1d6a80" stroke="#134c5d" stroke-width="40" stroke-linejoin="round"/>`);
  } else {
    const f = G.frame;
    out.push(`<rect x="${f.x}" y="${f.y}" width="${f.width}" height="${f.height}" rx="${f.rx}" fill="#1d6a80" stroke="#134c5d" stroke-width="40"/>`);
  }
  for (const harbor of board.harbors) {
    const g = G.harbor(harbor.edge);
    out.push(`<line x1="${g.a.x}" y1="${g.a.y}" x2="${g.x}" y2="${g.y}" stroke="#8a6a44" stroke-width="7"/>`);
    out.push(`<line x1="${g.b.x}" y1="${g.b.y}" x2="${g.x}" y2="${g.y}" stroke="#8a6a44" stroke-width="7"/>`);
    out.push(`<circle cx="${g.x}" cy="${g.y}" r="30" fill="#f8f0dc" stroke="#8a6a44" stroke-width="5"/>`);
    out.push(`<circle cx="${g.x}" cy="${g.y}" r="13" fill="${harbor.type === 'any' ? '#2b2118' : RESOURCE_COLORS[harbor.type]}"/>`);
  }
  for (const points of G.shorePoints) {
    out.push(`<polygon points="${points}" fill="#e9d49c" stroke="#e9d49c" stroke-width="18" stroke-linejoin="round"/>`);
  }
  board.hexes.forEach((tile, id) => {
    const [light, dark] = TERRAIN_COLORS[tile.terrain];
    out.push(`<polygon points="${G.tilePoints[id]}" fill="${light}" stroke="${dark}" stroke-width="6"/>`);
    if (tile.number) out.push(`<circle cx="${G.H[id].x}" cy="${G.H[id].y}" r="36" fill="#f8f0dc" stroke="#b59d6d" stroke-width="4"/>`);
  });
  const { x, y, width, height } = G.viewBox;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" width="${width}" height="${height}">${out.join('')}</svg>`;
}

/** Number token centres in viewBox units, for overlaying text. */
export function tokenPositions(board) {
  const G = geometryFor(board.layout);
  return board.hexes.flatMap((tile, id) => (tile.number ? [{ ...G.H[id], number: tile.number }] : []));
}
