import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FlowGraph, TaskState } from './FlowGraph';
import { Graph } from './layout';
import './styles.css';

// Talks to DagRunner's API (project 31). Falls back to a bundled sample so the UI works standalone.
const API = import.meta.env.VITE_DAGRUNNER_API ?? '/api';

const SAMPLE: Graph = {
  nodes: ['extract_pos', 'extract_wms', 'load_staging', 'reconcile', 'publish_report', 'page_oncall'],
  edges: [
    { from: 'extract_pos', to: 'load_staging' }, { from: 'extract_wms', to: 'load_staging' },
    { from: 'load_staging', to: 'reconcile' }, { from: 'reconcile', to: 'publish_report' }, { from: 'reconcile', to: 'page_oncall' },
  ],
};

interface RunTask { taskId: string; state: TaskState; attempts: number; lastError: string | null }

function App() {
  const params = new URLSearchParams(location.search);
  const dagId = params.get('dag') ?? 'nightly_inventory';
  const runId = params.get('run');
  const [graph, setGraph] = useState<Graph>(SAMPLE);
  const [tasks, setTasks] = useState<Record<string, RunTask>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    fetch(`${API}/dags/${dagId}/graph`).then((r) => (r.ok ? r.json() : Promise.reject())).then(setGraph).catch(() => setGraph(SAMPLE));
  }, [dagId]);

  // Poll run state while the run is active.
  useEffect(() => {
    if (!runId) return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch(`${API}/runs/${runId}`).then((x) => x.json());
        setTasks(Object.fromEntries((r.tasks as RunTask[]).map((t) => [t.taskId, t])));
        if (!stop && r.active) setTimeout(tick, 3000);
      } catch { if (!stop) setTimeout(tick, 10000); }
    };
    tick();
    return () => { stop = true; };
  }, [runId]);

  useEffect(() => {
    if (!runId || !selected) return;
    fetch(`${API}/runs/${runId}/tasks/${selected}/logs`).then((r) => r.json()).then(setLogs).catch(() => setLogs([]));
  }, [runId, selected, tasks[selected ?? '']?.state]);

  const states = Object.fromEntries(Object.values(tasks).map((t) => [t.taskId, t.state]));
  const sel = selected ? tasks[selected] : undefined;

  return (
    <div className="app">
      <header><h1>{dagId}</h1>{runId && <span>run #{runId}</span>}</header>
      <FlowGraph graph={graph} states={states} onSelect={setSelected} />
      {selected && (
        <aside>
          <h2>{selected}</h2>
          {sel && <p>{sel.state} · attempt {sel.attempts}{sel.lastError && <><br /><code>{sel.lastError}</code></>}</p>}
          {runId && (
            <button onClick={() => fetch(`${API}/runs/${runId}/tasks/${selected}/clear?downstream=true`, { method: 'POST' })}>
              Clear task + downstream
            </button>
          )}
          <pre>{logs.join('\n') || 'no logs'}</pre>
        </aside>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
