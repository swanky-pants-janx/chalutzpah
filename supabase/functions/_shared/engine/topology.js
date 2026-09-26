// Static geometry of each island layout: hexes, corners (vertices) and sides
// (edges). Built once per layout from its row lengths, so ids are
// deterministic everywhere (server, browser, preview images).
//
// Hexes are pointy-top with circumradius 1, laid out in centred rows. Vertex and
// edge ids are assigned in the order they are first met walking the hexes row
// by row, left to right. (The classic layout's ids are the same as they always
// were.)

const SQRT3 = Math.sqrt(3);

export const LAYOUT_SHAPES = Object.freeze({
  classic: {
    rows: [3, 4, 5, 4, 3],
    /** Gaps (in coastal edges) between consecutive harbors; sums to 30. */
    harborGaps: [3, 3, 4, 3, 3, 4, 3, 3, 4],
  },
  grand: {
    rows: [3, 4, 5, 6, 5, 4, 3],
    /** 11 harbors around 38 coastal edges. */
    harborGaps: [4, 3, 4, 3, 3, 4, 3, 4, 3, 4, 3],
  },
});

const round = (n) => Math.round(n * 1000) / 1000;

function buildTopology({ rows, harborGaps }) {
  const hexes = [];
  rows.forEach((length, k) => {
    for (let i = 0; i < length; i++) {
      const x = round(SQRT3 * (i - (length - 1) / 2));
      const y = round(1.5 * (k - (rows.length - 1) / 2));
      hexes.push({ id: hexes.length, x, y, row: k, vertices: [], edges: [], neighbors: [] });
    }
  });

  const vertices = [];
  const vertexByKey = new Map();
  const edges = [];
  const edgeByKey = new Map();

  for (const hex of hexes) {
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 90);
      const x = round(hex.x + Math.cos(angle));
      const y = round(hex.y + Math.sin(angle));
      const key = `${x},${y}`;
      let id = vertexByKey.get(key);
      if (id === undefined) {
        id = vertices.length;
        vertexByKey.set(key, id);
        vertices.push({ id, x, y, hexes: [], edges: [], neighbors: [] });
      }
      hex.vertices.push(id);
      vertices[id].hexes.push(hex.id);
    }
    for (let i = 0; i < 6; i++) {
      const a = hex.vertices[i];
      const b = hex.vertices[(i + 1) % 6];
      const [lo, hi] = a < b ? [a, b] : [b, a];
      const key = `${lo}-${hi}`;
      let id = edgeByKey.get(key);
      if (id === undefined) {
        id = edges.length;
        edgeByKey.set(key, id);
        edges.push({ id, vertices: [lo, hi], hexes: [] });
        vertices[lo].edges.push(id);
        vertices[hi].edges.push(id);
        vertices[lo].neighbors.push(hi);
        vertices[hi].neighbors.push(lo);
      }
      hex.edges.push(id);
      edges[id].hexes.push(hex.id);
    }
  }

  for (const edge of edges) {
    if (edge.hexes.length === 2) {
      const [a, b] = edge.hexes;
      hexes[a].neighbors.push(b);
      hexes[b].neighbors.push(a);
    }
  }

  const coastalEdges = edges
    .filter((edge) => edge.hexes.length === 1)
    .map((edge) => {
      const [a, b] = edge.vertices;
      const mx = (vertices[a].x + vertices[b].x) / 2;
      const my = (vertices[a].y + vertices[b].y) / 2;
      return { id: edge.id, angle: Math.atan2(my, mx) };
    })
    .sort((p, q) => p.angle - q.angle)
    .map((entry) => entry.id);

  const harborSlots = [];
  let index = 0;
  for (const gap of harborGaps) {
    harborSlots.push(coastalEdges[index]);
    index += gap;
  }

  return deepFreeze({ hexes, vertices, edges, coastalEdges, harborSlots });
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

const cache = new Map();

/** Topology for a layout id ('classic' | 'grand'); unknown ids fall back to classic. */
export function topologyFor(layout = 'classic') {
  const id = Object.hasOwn(LAYOUT_SHAPES, layout) ? layout : 'classic';
  if (!cache.has(id)) cache.set(id, buildTopology(LAYOUT_SHAPES[id]));
  return cache.get(id);
}

/** Topology of the board a game (or client view) is played on. */
export const topo = (s) => topologyFor(s?.board?.layout);

/** The classic 19-tile island (kept for code and tests that only need that one). */
export const TOPOLOGY = topologyFor('classic');
export const HEX_COUNT = TOPOLOGY.hexes.length;
export const VERTEX_COUNT = TOPOLOGY.vertices.length;
export const EDGE_COUNT = TOPOLOGY.edges.length;
