import { describe, it, expect } from 'vitest';
import { assignLayers, layout, countCrossings, lineage, Graph } from '../src/layout';

const diamond: Graph = {
  nodes: ['extract', 'clean', 'enrich', 'load'],
  edges: [{ from: 'extract', to: 'clean' }, { from: 'extract', to: 'enrich' }, { from: 'clean', to: 'load' }, { from: 'enrich', to: 'load' }],
};

describe('layering', () => {
  it('uses longest path so every edge goes forward', () => {
    const g: Graph = { nodes: ['a', 'b', 'c'], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'a', to: 'c' }] };
    const l = assignLayers(g);
    expect([l.get('a'), l.get('b'), l.get('c')]).toEqual([0, 1, 2]);
  });

  it('rejects cycles and unknown nodes', () => {
    expect(() => assignLayers({ nodes: ['a', 'b'], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }] })).toThrow(/cycle/);
    expect(() => assignLayers({ nodes: ['a'], edges: [{ from: 'a', to: 'z' }] })).toThrow(/unknown/);
  });
});

describe('layout', () => {
  it('places a diamond in three columns, centered', () => {
    const r = layout(diamond, { layerGap: 100, nodeGap: 50 });
    const at = Object.fromEntries(r.nodes.map((n) => [n.id, n]));
    expect([at.extract.x, at.clean.x, at.load.x]).toEqual([0, 100, 200]);
    expect(at.extract.y).toBe(at.load.y);
    expect(at.clean.y).not.toBe(at.enrich.y);
    expect(r.crossings).toBe(0);
  });

  it('routes long edges through dummy points, which are not returned as nodes', () => {
    const g: Graph = { nodes: ['a', 'b', 'c', 'd'], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'd' }, { from: 'a', to: 'd' }] };
    const r = layout(g);
    expect(r.nodes).toHaveLength(4);
    const long = r.edges.find((e) => e.from === 'a' && e.to === 'd')!;
    expect(long.points).toHaveLength(4);
  });

  it('removes crossings a naive ordering would create', () => {
    // Declared order makes a1→b2 and a2→b1 cross; barycenter sweeps should untangle it.
    const g: Graph = {
      nodes: ['a1', 'a2', 'b1', 'b2', 'c1', 'c2'],
      edges: [{ from: 'a1', to: 'b2' }, { from: 'a2', to: 'b1' }, { from: 'b1', to: 'c2' }, { from: 'b2', to: 'c1' }],
    };
    const naive = countCrossings([['a1', 'a2'], ['b1', 'b2'], ['c1', 'c2']], new Map([['a1', ['b2']], ['a2', ['b1']], ['b1', ['c2']], ['b2', ['c1']]]));
    expect(naive).toBe(2);
    expect(layout(g).crossings).toBe(0);
  });

  it('is deterministic', () => {
    expect(layout(diamond)).toEqual(layout(diamond));
  });

  it('handles disconnected nodes and a realistic pipeline', () => {
    const g: Graph = {
      nodes: ['extract_pos', 'extract_wms', 'load_staging', 'reconcile', 'publish_report', 'page_oncall', 'vacuum'],
      edges: [
        { from: 'extract_pos', to: 'load_staging' }, { from: 'extract_wms', to: 'load_staging' },
        { from: 'load_staging', to: 'reconcile' }, { from: 'reconcile', to: 'publish_report' }, { from: 'reconcile', to: 'page_oncall' },
      ],
    };
    const r = layout(g);
    expect(r.nodes).toHaveLength(7);
    expect(r.crossings).toBe(0);
    expect(r.nodes.find((n) => n.id === 'vacuum')!.layer).toBe(0);
  });
});

describe('lineage', () => {
  it('collects upstream and downstream but not siblings', () => {
    expect([...lineage(diamond, 'clean')].sort()).toEqual(['clean', 'extract', 'load']);
  });
});
