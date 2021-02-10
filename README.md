# FlowGraph UI

Portfolio reference implementation of a 2020 project, built to show an interactive viewer for pipeline DAGs and live run status. It is the front end for **DagRunner** (see `dagrunner/`).

**Stack:** React 18, TypeScript, D3 (`d3-zoom`, `d3-shape`), Vite, Vitest.

## Features
- **Layered layout, written by hand** (`src/layout.ts`), with no dagre dependency:
  1. Longest-path layering.
  2. Dummy nodes for edges that span several layers.
  3. Alternating barycenter sweeps for crossing reduction, keeping the best ordering found.
  4. Centered coordinates.
  The result is deterministic, so the graph doesn't jump between polls.
- **D3 for interaction, React for rendering:** `d3-zoom` handles pan, zoom and fit-to-view, and React renders the nodes and edges. Edges are smoothed with `curveBasis` through the dummy points.
- **Live run overlay:** polls `GET /api/runs/{id}` while the run is active. Node colour shows each task's state, and running tasks pulse.
- **Lineage highlighting:** hovering a node dims everything that isn't upstream or downstream of it.
- **Side panel:** shows task state, attempt count, last error and logs, plus a "clear task + downstream" button that re-runs it.
- **Standalone:** falls back to a sample DAG when no API is reachable.

## Run
```bash
npm install
npm run dev     # http://localhost:5173/?dag=nightly_inventory&run=42  (proxies /api to :8080)
npm test        # layout: layering, cycles, dummy routing, crossing removal, determinism
npm run build   # tsc --noEmit + vite build
```
