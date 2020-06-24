// Layered (Sugiyama-style) DAG layout, written from scratch so it can run in a worker and be unit tested.
//   1. layering: longest path from sources, so every edge points to a lower layer
//   2. long edges are split with dummy nodes so they route around real nodes
//   3. crossing reduction: alternating down/up barycenter sweeps, keeping the best ordering seen
//   4. coordinates: layer → x, order within layer → y, then each layer is centered

export interface Edge { from: string; to: string }
export interface Graph { nodes: string[]; edges: Edge[] }

export interface LaidOutNode { id: string; layer: number; order: number; x: number; y: number; dummy: boolean }
export interface LaidOutEdge { from: string; to: string; points: [number, number][] }
export interface Layout { nodes: LaidOutNode[]; edges: LaidOutEdge[]; width: number; height: number; crossings: number }

export interface LayoutOptions { layerGap?: number; nodeGap?: number; sweeps?: number }

export function assignLayers(g: Graph): Map<string, number> {
  const preds = new Map<string, string[]>(g.nodes.map((n) => [n, []]));
  for (const e of g.edges) {
    if (!preds.has(e.to) || !preds.has(e.from)) throw new Error(`edge references unknown node: ${e.from} -> ${e.to}`);
    preds.get(e.to)!.push(e.from);
  }
  const layer = new Map<string, number>();
  const visiting = new Set<string>();
  const visit = (n: string): number => {
    const known = layer.get(n);
    if (known !== undefined) return known;
    if (visiting.has(n)) throw new Error(`cycle through ${n}`);
    visiting.add(n);
    const l = Math.max(-1, ...preds.get(n)!.map(visit)) + 1;
    visiting.delete(n);
    layer.set(n, l);
    return l;
  };
  g.nodes.forEach(visit);
  return layer;
}

interface Work {
  layers: string[][];
  layerOf: Map<string, number>;
  down: Map<string, string[]>; // neighbours in next layer
  up: Map<string, string[]>; // neighbours in previous layer
  chains: Map<string, string[]>; // original edge key -> node path including dummies
  dummies: Set<string>;
}

function buildWork(g: Graph, layerOf: Map<string, number>): Work {
  const maxLayer = Math.max(0, ...layerOf.values());
  const layers: string[][] = Array.from({ length: maxLayer + 1 }, () => []);
  for (const n of g.nodes) layers[layerOf.get(n)!].push(n);
  const down = new Map<string, string[]>();
  const up = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    if (!down.has(a)) down.set(a, []);
    if (!up.has(b)) up.set(b, []);
    down.get(a)!.push(b);
    up.get(b)!.push(a);
  };
  const chains = new Map<string, string[]>();
  const dummies = new Set<string>();
  for (const e of g.edges) {
    const path = [e.from];
    for (let l = layerOf.get(e.from)! + 1; l < layerOf.get(e.to)!; l++) {
      const d = `__d:${e.from}->${e.to}:${l}`;
      dummies.add(d);
      layers[l].push(d);
      layerOf.set(d, l);
      path.push(d);
    }
    path.push(e.to);
    for (let i = 0; i + 1 < path.length; i++) link(path[i], path[i + 1]);
    chains.set(`${e.from}->${e.to}`, path);
  }
  return { layers, layerOf, down, up, chains, dummies };
}

/** Crossings between two adjacent layers, counted pairwise (fine for the sizes DAG UIs show). */
export function countCrossings(layers: string[][], down: Map<string, string[]>): number {
  let total = 0;
  for (let l = 0; l + 1 < layers.length; l++) {
    const pos = new Map(layers[l + 1].map((n, i) => [n, i]));
    const segs: [number, number][] = [];
    layers[l].forEach((n, i) => (down.get(n) ?? []).forEach((m) => segs.push([i, pos.get(m)!])));
    for (let a = 0; a < segs.length; a++)
      for (let b = a + 1; b < segs.length; b++) {
        const [a1, a2] = segs[a];
        const [b1, b2] = segs[b];
        if ((a1 - b1) * (a2 - b2) < 0) total++;
      }
  }
  return total;
}

function barycenterSweep(layers: string[][], neighbours: Map<string, string[]>, from: number, to: number, step: number) {
  for (let l = from; l !== to; l += step) {
    const ref = new Map(layers[l - step].map((n, i) => [n, i]));
    const current = layers[l];
    const score = new Map<string, number>();
    current.forEach((n, i) => {
      const ns = (neighbours.get(n) ?? []).map((m) => ref.get(m)!).filter((v) => v !== undefined);
      // Nodes with no neighbours on the reference side keep their position.
      score.set(n, ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : i);
    });
    // Stable sort: ties keep their previous relative order, so the result is deterministic.
    layers[l] = current.map((n, i) => ({ n, i })).sort((a, b) => score.get(a.n)! - score.get(b.n)! || a.i - b.i).map((x) => x.n);
  }
}

export function layout(g: Graph, opts: LayoutOptions = {}): Layout {
  const layerGap = opts.layerGap ?? 200;
  const nodeGap = opts.nodeGap ?? 70;
  const sweeps = opts.sweeps ?? 8;

  const w = buildWork(g, assignLayers(g));
  let best = w.layers.map((l) => [...l]);
  let bestCrossings = countCrossings(best, w.down);
  for (let s = 0; s < sweeps && bestCrossings > 0; s++) {
    if (s % 2 === 0) barycenterSweep(w.layers, w.up, 1, w.layers.length, 1);
    else barycenterSweep(w.layers, w.down, w.layers.length - 2, -1, -1);
    const c = countCrossings(w.layers, w.down);
    if (c < bestCrossings) {
      bestCrossings = c;
      best = w.layers.map((l) => [...l]);
    }
  }

  const tallest = Math.max(...best.map((l) => l.length));
  const height = Math.max(1, tallest) * nodeGap;
  const pos = new Map<string, LaidOutNode>();
  best.forEach((nodes, layer) => {
    const offset = (height - nodes.length * nodeGap) / 2;
    nodes.forEach((id, order) =>
      pos.set(id, { id, layer, order, x: layer * layerGap, y: offset + order * nodeGap + nodeGap / 2, dummy: w.dummies.has(id) }));
  });

  const edges: LaidOutEdge[] = g.edges.map((e) => ({
    from: e.from,
    to: e.to,
    points: w.chains.get(`${e.from}->${e.to}`)!.map((n) => [pos.get(n)!.x, pos.get(n)!.y] as [number, number]),
  }));

  return {
    nodes: [...pos.values()].filter((n) => !n.dummy),
    edges,
    width: (best.length - 1) * layerGap,
    height,
    crossings: bestCrossings,
  };
}

/** Upstream and downstream closure of a node, for hover highlighting. */
export function lineage(g: Graph, id: string): Set<string> {
  const out = new Set<string>([id]);
  const walk = (start: string, dir: 'up' | 'down') => {
    const stack = [start];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const e of g.edges) {
        const next = dir === 'down' ? (e.from === cur ? e.to : null) : e.to === cur ? e.from : null;
        if (next && !out.has(next)) { out.add(next); stack.push(next); }
      }
    }
  };
  walk(id, 'down');
  walk(id, 'up');
  return out;
}
