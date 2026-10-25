import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {
  ReactFlow, Background, Controls, Handle, MiniMap, Position,
  type Connection, type Edge, type EdgeChange, type Node, type NodeChange, type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './style.css';
import {Agent} from '@instinct/core';
import {BlackboardStore} from '@instinct/blackboard';
import {TraceRecorder, type TraceSnapshot} from '@instinct/devtools';
import {
  compileGraph, parseGraph, sampleGraph, serializeGraph, validateGraph,
  NODE_KINDS, type BehaviorGraph, type BehaviorKind, type TreeNode, type BehaviorRegistry,
} from '@instinct/definition';

type FlowData = {kind: BehaviorKind; label: string; task?: string; root: boolean; debugStatus?: string};
type FlowNode = Node<FlowData, 'behavior'>;
type Memory = {health: number; hasTarget: boolean; events: string[]};
type MemoryStore = BlackboardStore<Memory>;
const registry: BehaviorRegistry<MemoryStore> = {
  conditions: {
    lowHealth: ({blackboard}) => blackboard.get('health') < 30,
    hasTarget: ({blackboard}) => blackboard.get('hasTarget'),
  },
  actions: {
    retreat: ({blackboard}) => {blackboard.get('events').push('Retreat to cover'); return 'running';},
    attack: ({blackboard}) => {blackboard.get('events').push('Attack target'); return 'running';},
    patrol: ({blackboard}) => {blackboard.get('events').push('Continue patrol'); return 'running';},
  },
};
const leaf = (kind: BehaviorKind) => kind === 'action' || kind === 'condition';
const availableTasks = (kind: BehaviorKind) => kind === 'condition'
  ? ['lowHealth', 'hasTarget'] : kind === 'action' ? ['patrol', 'retreat', 'attack'] : [];

function VisualNode({data, selected}: NodeProps<FlowNode>) {
  return (
    <div className={['tree-node', 'kind-' + data.kind, selected ? 'selected' : '', data.debugStatus ? 'trace-' + data.debugStatus : ''].join(' ')}>
      {!data.root && <Handle type="target" position={Position.Left}/>}
      <div className="kind-name">{data.root ? 'ROOT · ' : ''}{data.kind}</div>
      <div className="node-label">{data.label}</div>
      {data.task && <div className="task-name">{data.task}</div>}
      {data.debugStatus && <div className="runtime-status">{data.debugStatus}</div>}
      {!leaf(data.kind) && <Handle type="source" position={Position.Right}/>}
    </div>
  );
}
const nodeTypes = {behavior: VisualNode};

function App() {
  const [graph, setGraph] = useState<BehaviorGraph>(() => sampleGraph());
  const [selectedId, setSelectedId] = useState<string | null>('root');
  const [newKind, setNewKind] = useState<BehaviorKind>('action');
  const [jsonText, setJsonText] = useState('');
  const [notice, setNotice] = useState('Connect a parent to a child using the handles. Child order sets execution priority.');
  const [health, setHealth] = useState(100);
  const [hasTarget, setHasTarget] = useState(false);
  const [previewStatus, setPreviewStatus] = useState('Not started');
  const [previewEvents, setPreviewEvents] = useState<string[]>([]);
  const [trace, setTrace] = useState<TraceSnapshot | null>(null);
  const [autoPlaying, setAutoPlaying] = useState(false);
  const nonce = useRef(0);
  const running = useRef<{graph: BehaviorGraph; agent: Agent<MemoryStore>; memory: MemoryStore; recorder: TraceRecorder} | null>(null);
  const validation = useMemo(() => validateGraph(graph), [graph]);
  const selected = graph.nodes.find(node => node.id === selectedId);
  const nodes = useMemo<FlowNode[]>(() => graph.nodes.map(n => ({
    id: n.id, type: 'behavior', position: n.position,
    data: {kind: n.kind, label: n.label, ...(n.task ? {task: n.task} : {}), root: n.id === graph.rootId, ...(trace?.nodeStatuses[n.id] ? {debugStatus: trace.nodeStatuses[n.id]} : {})},
    selected: n.id === selectedId,
  })), [graph, selectedId, trace]);
  const edges = useMemo<Edge[]>(() => graph.nodes.flatMap(n => n.children.map((childId, index) => ({
    id: n.id + ':' + childId, source: n.id, target: childId,
    label: String(index + 1), type: 'smoothstep', animated: false,
    style: {stroke: '#89a4bd', strokeWidth: 1.8},
    labelStyle: {fill: '#d6e6f2', fontWeight: 700},
    labelBgStyle: {fill: '#24394a'},
  }))), [graph]);

  const changeNode = useCallback((id: string, mutate: (node: TreeNode) => TreeNode) => {
    setGraph(current => ({...current, nodes: current.nodes.map(node => node.id === id ? mutate(node) : node)}));
  }, []);

  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => {
    const positions = new Map<string, {x: number; y: number}>();
    const removed = new Set<string>();
    for (const change of changes) {
      if (change.type === 'position' && change.position) positions.set(change.id, change.position);
      if (change.type === 'remove') removed.add(change.id);
    }
    if (!removed.size && !positions.size) return;
    setGraph(current => {
      removed.delete(current.rootId);
      return {...current, nodes: current.nodes.filter(n => !removed.has(n.id)).map(n => ({
        ...n,
        position: positions.get(n.id) ?? n.position,
        children: n.children.filter(child => !removed.has(child)),
      }))};
    });
    if (removed.has(selectedId ?? '')) setSelectedId(null);
  }, [selectedId]);

  const removeEdge = useCallback((source: string, target: string) => {
    changeNode(source, n => ({...n, children: n.children.filter(id => id !== target)}));
  }, [changeNode]);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    for (const change of changes) {
      if (change.type !== 'remove') continue;
      const edge = edges.find(edge => edge.id === change.id);
      if (edge) removeEdge(edge.source, edge.target);
    }
  }, [edges, removeEdge]);

  const onConnect = useCallback((connection: Connection) => {
    const {source, target} = connection;
    if (!source || !target || source === target) {setNotice('Cannot connect a node to itself.'); return;}
    const parent = graph.nodes.find(n => n.id === source);
    const child = graph.nodes.find(n => n.id === target);
    if (!parent || !child || leaf(parent.kind)) {setNotice('Only composites and decorators accept children.'); return;}
    if (child.id === graph.rootId) {setNotice('The root cannot have a parent.'); return;}
    if (parent.children.includes(target)) {setNotice('These nodes are already connected.'); return;}
    if (parent.kind === 'inverter' && parent.children.length > 0) {setNotice('Inverter accepts exactly one child.'); return;}
    if (graph.nodes.some(n => n.children.includes(target))) {setNotice('Each child may have only one parent.'); return;}
    const reachable = (from: string, destination: string, seen = new Set<string>()): boolean => {
      if (from === destination) return true;
      if (seen.has(from)) return false;
      seen.add(from);
      return (graph.nodes.find(n => n.id === from)?.children ?? []).some(child => reachable(child, destination, seen));
    };
    if (reachable(target, source)) {setNotice('Cycles are not allowed in behavior trees.'); return;}
    changeNode(source, n => ({...n, children: [...n.children, target]}));
    setNotice('Connected. Child priority follows its order in the parent inspector.');
  }, [graph, changeNode]);

  const addNode = () => {
    const id = newKind + '-' + (++nonce.current).toString(36) + '-' + Date.now().toString(36);
    const pos = selected?.position ?? {x: 100, y: 100};
    const node: TreeNode = {
      id, kind: newKind,
      label: newKind === 'action' ? 'New action' : newKind === 'condition' ? 'New condition' : newKind,
      ...(leaf(newKind) ? {task: availableTasks(newKind)[0]} : {}),
      children: [], position: {x: pos.x + 290, y: pos.y + 140},
    };
    setGraph(current => ({...current, nodes: [...current.nodes, node]}));
    setSelectedId(id);
    setNotice('Node added. Connect it to a parent to resolve orphan warnings.');
  };

  const deleteSelected = () => {
    if (!selected || selected.id === graph.rootId) return;
    setGraph(current => ({
      ...current,
      nodes: current.nodes.filter(n => n.id !== selected.id).map(n => ({
        ...n, children: n.children.filter(id => id !== selected.id),
      })),
    }));
    setSelectedId(graph.rootId);
  };

  const reorder = (childIndex: number, direction: number) => {
    if (!selected) return;
    const other = childIndex + direction;
    if (other < 0 || other >= selected.children.length) return;
    changeNode(selected.id, n => {
      const children = [...n.children];
      [children[childIndex], children[other]] = [children[other]!, children[childIndex]!];
      return {...n, children};
    });
  };

  const exportGraph = async () => {
    try {
      const value = serializeGraph(graph);
      setJsonText(value);
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        setNotice('Valid graph exported to JSON and copied to clipboard.');
      } else setNotice('Valid graph exported to the JSON panel.');
    } catch (error) {setNotice(error instanceof Error ? error.message : 'Export failed');}
  };
  const importGraph = () => {
    try {
      const value = parseGraph(jsonText);
      setGraph(value);
      setSelectedId(value.rootId);
      resetPreview();
      setNotice('Graph imported and validated.');
    } catch (error) {setNotice(error instanceof Error ? error.message : 'Import failed');}
  };
  const stepPreview = useCallback(() => {
    try {
      if (!running.current || running.current.graph !== graph) {
        running.current?.agent.stop();
        running.current?.recorder.dispose();
        const memory = new BlackboardStore<Memory>({health, hasTarget, events: []});
        const recorder = new TraceRecorder({capacity: 192});
        const agent = new Agent(compileGraph(graph, registry, {observer: recorder}), memory);
        recorder.watchBlackboard(memory);
        running.current = {graph, memory, agent, recorder};
      }
      const preview = running.current;
      preview.recorder.beginTick();
      preview.memory.set('health', health);
      preview.memory.set('hasTarget', hasTarget);
      preview.memory.get('events').length = 0;
      const status = preview.agent.tick(0.05);
      setPreviewStatus(status);
      setPreviewEvents([...preview.memory.get('events')]);
      setTrace(preview.recorder.snapshot());
      setNotice('Tick complete · 50ms simulated AI time');
    } catch (error) {
      setAutoPlaying(false);
      setPreviewStatus('Error');
      setNotice(error instanceof Error ? error.message : 'Preview failed');
    }
  }, [graph, health, hasTarget]);
  const resetPreview = () => {
    running.current?.agent.stop();
    running.current?.recorder.dispose();
    running.current = null;
    setAutoPlaying(false);
    setPreviewStatus('Not started');
    setPreviewEvents([]);
    setTrace(null);
  };

  useEffect(() => {
    if (!autoPlaying) return;
    const interval = window.setInterval(stepPreview, 200);
    return () => window.clearInterval(interval);
  }, [autoPlaying, stepPreview]);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand"><span className="brand-icon">◈</span><div><strong>instinct<span className="accent">.</span></strong><small>BEHAVIOR STUDIO / ALPHA</small></div></div>
        <div className="top-actions">
          <span className={validation.valid ? 'status good' : 'status bad'}>{validation.valid ? '✓ Valid tree' : validation.issues.length + ' issues'}</span>
          <button onClick={() => {setGraph(sampleGraph()); setSelectedId('root'); resetPreview();}}>Reset sample</button>
          <button className="primary" onClick={() => void exportGraph()}>Export JSON</button>
        </div>
      </header>
      <div className="body-layout">
        <aside className="sidebar">
          <div className="section"><span className="eyebrow">NODE LIBRARY</span><h2>Compose behavior</h2><p>Connect actions and conditions to build a runnable decision tree.</p>
            <label className="control-label" htmlFor="newKind">New node type</label>
            <select id="newKind" value={newKind} onChange={e => setNewKind(e.target.value as BehaviorKind)}>
              {NODE_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
            <button className="wide" onClick={addNode}>+ Add node to canvas</button>
          </div>
          <div className="section">
            <span className="eyebrow">INSPECTOR</span>
            {selected ? <div className="inspector">
              <h2>{selected.label}</h2><div className="muted tiny">{selected.id === graph.rootId ? 'Root node' : selected.id}</div>
              <label className="control-label" htmlFor="nodeLabel">Display label</label>
              <input id="nodeLabel" value={selected.label} maxLength={80} onChange={e => changeNode(selected.id, n => ({...n, label: e.target.value}))}/>
              {leaf(selected.kind) && <><label className="control-label" htmlFor="taskKey">Task registry key</label>
                <input id="taskKey" list="taskOptions" value={selected.task ?? ''} onChange={e => changeNode(selected.id, n => ({...n, task: e.target.value}))}/>
                <datalist id="taskOptions">{availableTasks(selected.kind).map(t => <option key={t} value={t}/>)}</datalist>
              </>}
              {!leaf(selected.kind) && <><div className="control-label">Child priority · first wins</div>
                {selected.children.length ? selected.children.map((id, index) => (
                  <div className="child-item" key={id}><span>{index + 1}. {graph.nodes.find(n => n.id === id)?.label ?? id}</span>
                  <button title="Move up" disabled={index === 0} onClick={() => reorder(index, -1)}>↑</button>
                  <button title="Move down" disabled={index === selected.children.length - 1} onClick={() => reorder(index, +1)}>↓</button></div>
                )) : <p className="muted tiny">Connect a child using the right-side handle.</p>}
              </>}
              {selected.id !== graph.rootId && <button className="danger wide" onClick={deleteSelected}>Delete selected node</button>}
            </div> : <p>Click a node to inspect its settings.</p>}
          </div>
        </aside>
        <main className="canvas">
          <div className="canvas-title"><div><span className="eyebrow">VISUAL AUTHORING</span><h1>Enemy decision tree</h1></div><span className="muted">Drag nodes · Connect handles · Set priority</span></div>
          <ReactFlow<FlowNode>
            nodes={nodes} edges={edges} nodeTypes={nodeTypes}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            onPaneClick={() => setSelectedId(null)}
            fitView fitViewOptions={{padding: 0.15}} minZoom={0.25} maxZoom={1.5}
            deleteKeyCode={['Backspace', 'Delete']} edgesReconnectable={false}
          >
            <Background color="#314258" gap={24} size={1}/>
            <MiniMap pannable zoomable nodeColor="#366a86" style={{background: '#142233'}}/>
            <Controls showInteractive={false}/>
          </ReactFlow>
        </main>
        <aside className="right-pane">
          <div className="section"><span className="eyebrow">SANDBOX</span><h2>Test behavior</h2>
            <label className="control-label" htmlFor="health">Health · {health}</label>
            <input id="health" type="range" min={0} max={100} value={health} onChange={e => setHealth(Number(e.target.value))}/>
            <label className="check-row"><input type="checkbox" checked={hasTarget} onChange={e => setHasTarget(e.target.checked)}/> Target detected</label>
            <div className="preview-output"><span className="eyebrow">LAST RESULT</span><strong>{previewStatus}</strong>{previewEvents.map((event, i) => <p key={i}>{event}</p>)}</div>
            <div className="split"><button className="primary" onClick={stepPreview}>▶ Step</button><button onClick={() => setAutoPlaying(active => !active)}>{autoPlaying ? '⏸ Pause' : '▶ Play'}</button><button onClick={resetPreview}>Reset</button></div>
            <p className="muted tiny">Play advances one 50ms AI tick every 200ms of wall time. Pause freezes the simulation; Step advances exactly once.</p>
          </div>
          <div className="section debugger-pane">
            <span className="eyebrow">LIVE DEBUGGER · LOCAL PREVIEW</span>
            <h2>Node execution</h2>
            <p className="muted tiny">Most recent tick: {trace?.tick ?? 0}. Active nodes glow green; failed nodes red; canceled nodes amber.</p>
            <div className="debug-metrics">
              <span>{trace?.nodeStatuses ? Object.values(trace.nodeStatuses).filter(v => v === 'running').length : 0} running</span>
              <span>{trace?.entries.length ?? 0} events retained</span>
            </div>
            <span className="eyebrow">BLACKBOARD SNAPSHOT</span>
            <div className="debug-memory">{trace ? Object.entries(trace.blackboard).map(([key, value]) => (
              <div key={key}><code>{key}</code><span>{value}</span></div>
            )) : <p className="muted tiny">Run a tick to inspect memory.</p>}</div>
            <span className="eyebrow">RECENT EVENTS</span>
            <div className="debug-history" aria-label="Execution trace">
              {trace?.entries.slice(-12).reverse().map(event => (
                <div key={event.sequence} className="debug-entry"><span className="debug-seq">#{event.sequence}</span>
                  {event.kind === 'node' ? <><strong>{event.nodeId}</strong><span className={'debug-status ' + event.status}>{event.status}</span></> :
                    <><strong>{event.key}</strong><span>{event.previous} → {event.current}</span></>}
                </div>
              )) ?? <p className="muted tiny">No execution events yet.</p>}
            </div>
          </div>
          <div className="section"><span className="eyebrow">VALIDATION</span>
            {validation.valid ? <p className="good-text">✓ Tree topology and schema are valid.</p> :
              <ul className="issue-list">{validation.issues.slice(0, 10).map((issue, i) => <li key={i}><b>{issue.code}</b> {issue.message}{issue.nodeId ? ' · ' + issue.nodeId : ''}</li>)}</ul>}
          </div>
          <div className="section json-panel"><span className="eyebrow">PORTABLE GRAPH / V1</span>
            <p className="muted tiny">Export a valid tree, edit the JSON, then import it. Invalid data is rejected.</p>
            <textarea aria-label="Graph JSON" spellCheck={false} value={jsonText} onChange={e => setJsonText(e.target.value)} placeholder="JSON appears here after export…"/>
            <button className="wide" onClick={importGraph}>Import & validate JSON</button>
          </div>
        </aside>
      </div>
      <footer className="footer"><span>INSTINCT / GRAPH AUTHORING / v0.1.0-alpha</span><span role="status">{notice}</span><span>NO GAME ENGINE REQUIRED</span></footer>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
