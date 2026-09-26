// Static geometry of the 19-tile island: hexes, corners (vertices) and sides (edges).
// Computed once from axial coordinates so ids are deterministic everywhere.
//
// Hexes are pointy-top with circumradius 1. Vertex/edge ids are assigned in the
// order they are first encountered while walking hexes row by row.

const SQRT3 = Math.sqrt(3);
const RADIUS = 2;

/** Gaps (in coastal edges) between consecutive harbors; sums to 30 coastal edges. */
const HARBOR_GAPS = [3, 3, 4, 3, 3, 4, 3, 3, 4];

const round = (n) => Math.round(n * 1000) / 1000;

function buildTopology() {
  const hexes = [];
  for (let r = -RADIUS; r <= RADIUS; r++) {
    const qMin = Math.max(-RADIUS, -r - RADIUS);
    const qMax = Math.min(RADIUS, -r + RADIUS);
    for (let q = qMin; q <= qMax; q++) {
      hexes.push({
        id: hexes.length,
        q,
        r,
        x: round(SQRT3 * (q + r / 2)),
        y: round(1.5 * r),
        vertices: [],
        edges: [],
        neighbors: [],
      });
    }
  }

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
  for (const gap of HARBOR_GAPS) {
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

export const TOPOLOGY = buildTopology();
export const HEX_COUNT = TOPOLOGY.hexes.length;
export const VERTEX_COUNT = TOPOLOGY.vertices.length;
export const EDGE_COUNT = TOPOLOGY.edges.length;
