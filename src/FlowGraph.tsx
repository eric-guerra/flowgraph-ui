import { useEffect, useMemo, useRef, useState } from 'react';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, ZoomBehavior } from 'd3-zoom';
import { line, curveBasis } from 'd3-shape';
import { layout, lineage, Graph } from './layout';

export type TaskState = 'PENDING' | 'QUEUED' | 'RUNNING' | 'UP_FOR_RETRY' | 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'UPSTREAM_FAILED';

const COLORS: Record<TaskState, string> = {
  PENDING: '#c5cad3', QUEUED: '#9fb3d1', RUNNING: '#3d8bfd', UP_FOR_RETRY: '#f0ad4e',
  SUCCESS: '#2e9e5b', FAILED: '#d64541', SKIPPED: '#e3c7f0', UPSTREAM_FAILED: '#f2a39f',
};

const NODE_W = 150;
const NODE_H = 36;
const path = line<[number, number]>().curve(curveBasis);

interface Props {
  graph: Graph;
  states?: Record<string, TaskState>;
  onSelect?: (taskId: string) => void;
}

export function FlowGraph({ graph, states = {}, onSelect }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown>>();
  const [hover, setHover] = useState<string | null>(null);

  const l = useMemo(() => layout(graph), [graph]);
  const lit = useMemo(() => (hover ? lineage(graph, hover) : null), [graph, hover]);

  // d3 owns pan/zoom on the <g>; React owns everything inside it.
  useEffect(() => {
    const svg = select(svgRef.current!);
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 3])
      .on('zoom', (e) => select(gRef.current!).attr('transform', e.transform.toString()));
    zoomRef.current = z;
    svg.call(z);
    return () => { svg.on('.zoom', null); };
  }, []);

  // Fit to view whenever the graph shape changes.
  useEffect(() => {
    const svg = svgRef.current!;
    const { width, height } = svg.getBoundingClientRect();
    const contentW = l.width + NODE_W + 40;
    const contentH = l.height + 40;
    const k = Math.min(1.5, width / contentW, height / contentH);
    const t = zoomIdentity.translate((width - contentW * k) / 2 + (NODE_W / 2 + 20) * k, (height - contentH * k) / 2 + 20 * k).scale(k);
    select(svg).call(zoomRef.current!.transform, t);
  }, [l]);

  return (
    <svg ref={svgRef} className="flowgraph" role="img" aria-label="Task dependency graph">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="#8a93a3" />
        </marker>
      </defs>
      <g ref={gRef}>
        {l.edges.map((e) => {
          const pts = e.points.map(([x, y], i) =>
            i === 0 ? [x + NODE_W / 2, y] : i === e.points.length - 1 ? [x - NODE_W / 2, y] : [x, y]) as [number, number][];
          const dim = lit && !(lit.has(e.from) && lit.has(e.to));
          return <path key={`${e.from}->${e.to}`} d={path(pts) ?? ''} className="edge" opacity={dim ? 0.15 : 1} markerEnd="url(#arrow)" />;
        })}
        {l.nodes.map((n) => {
          const state = states[n.id] ?? 'PENDING';
          return (
            <g key={n.id} transform={`translate(${n.x - NODE_W / 2},${n.y - NODE_H / 2})`} className={`node ${state.toLowerCase()}`}
               opacity={lit && !lit.has(n.id) ? 0.25 : 1}
               onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} onClick={() => onSelect?.(n.id)}
               tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onSelect?.(n.id)}>
              <rect width={NODE_W} height={NODE_H} rx={6} fill="#fff" stroke={COLORS[state]} strokeWidth={state === 'RUNNING' ? 3 : 2} />
              <rect width={6} height={NODE_H} rx={3} fill={COLORS[state]} />
              <text x={14} y={NODE_H / 2 + 4}>{n.id.length > 18 ? n.id.slice(0, 17) + '…' : n.id}</text>
              <title>{`${n.id} — ${state}`}</title>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
