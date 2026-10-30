import * as THREE from 'three';
import {Agent} from '@instinct/core';
import {BlackboardStore} from '@instinct/blackboard';
import {compileGraph, sampleGraph, type BehaviorRegistry} from '@instinct/definition';
import {TraceRecorder} from '@instinct/devtools';
import {AgentScheduler, type SchedulerStats} from '@instinct/three';
import {summarize} from './benchmark-model.js';

type Memory = {health: number; hasTarget: boolean; decisions: number};
const graph = sampleGraph();
const viewport = document.querySelector<HTMLElement>('#viewport')!;
const metricsEl = document.querySelector<HTMLElement>('#metrics')!;
const progressEl = document.querySelector<HTMLElement>('#progress')!;
const reportEl = document.querySelector<HTMLTextAreaElement>('#report')!;
const agentSelect = document.querySelector<HTMLSelectElement>('#agents')!;
const minutesSelect = document.querySelector<HTMLSelectElement>('#minutes')!;
const traceCheckbox = document.querySelector<HTMLInputElement>('#trace')!;
const startButton = document.querySelector<HTMLButtonElement>('#start')!;
const stopButton = document.querySelector<HTMLButtonElement>('#stop')!;
const resetButton = document.querySelector<HTMLButtonElement>('#reset')!;
const downloadButton = document.querySelector<HTMLButtonElement>('#download')!;
const copyButton = document.querySelector<HTMLButtonElement>('#copy')!;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111b28);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
camera.position.set(0, 21, 29);
camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x405060, 2));
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 30),
  new THREE.MeshLambertMaterial({color: 0x253b3f}),
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({antialias: false, powerPreference: 'low-power'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  viewport.appendChild(renderer.domElement);
} catch (error) {
  const message = error instanceof Error ? error.message : 'WebGL unavailable';
  progressEl.textContent = 'Renderer initialization failed: ' + message;
  throw error;
}
let contextLosses = 0;
let contextRestores = 0;
const runtimeErrors: string[] = [];
const contextHistory: {type: string; at: string}[] = [];
renderer.domElement.addEventListener('webglcontextlost', event => {
  event.preventDefault();
  contextLosses++;
  contextHistory.push({type: 'lost', at: new Date().toISOString()});
});
renderer.domElement.addEventListener('webglcontextrestored', () => {
  contextRestores++;
  contextHistory.push({type: 'restored', at: new Date().toISOString()});
});
window.addEventListener('error', event => {
  if (runtimeErrors.length < 20) runtimeErrors.push(String(event.message).slice(0, 180));
});
window.addEventListener('unhandledrejection', event => {
  if (runtimeErrors.length < 20) runtimeErrors.push(String(event.reason).slice(0, 180));
});

function resize(): void {
  const width = Math.max(100, viewport.clientWidth);
  const height = Math.max(100, viewport.clientHeight);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}
window.addEventListener('resize', resize);
resize();

class Workload {
  readonly count: number;
  readonly traced: boolean;
  readonly scheduler = new AgentScheduler();
  readonly mesh: THREE.InstancedMesh;
  readonly x: Float32Array;
  readonly z: Float32Array;
  readonly dummy = new THREE.Object3D();
  readonly recorder: TraceRecorder | null;
  readonly boards: BlackboardStore<Memory>[] = [];
  decisions = 0;
  private readonly material: THREE.MeshLambertMaterial;
  private readonly geometry: THREE.BoxGeometry;
  constructor(count: number, traced: boolean) {
    this.count = count;
    this.traced = traced;
    this.x = new Float32Array(count);
    this.z = new Float32Array(count);
    this.geometry = new THREE.BoxGeometry(0.42, 0.8, 0.42);
    this.material = new THREE.MeshLambertMaterial({color: 0x84d7bd});
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.recorder = traced ? new TraceRecorder({capacity: 64}) : null;
    for (let i = 0; i < count; i++) {
      this.x[i] = ((i % 25) - 12) * .85;
      this.z[i] = (Math.floor(i / 25) - Math.floor(count / 50)) * 1.0;
      const memory = new BlackboardStore<Memory>({
        health: i % 11 === 0 ? 20 : 100, hasTarget: false, decisions: 0,
      });
      this.boards.push(memory);
      const registry: BehaviorRegistry<typeof memory> = {
        conditions: {
          lowHealth: ({blackboard}) => blackboard.get('health') < 30,
          hasTarget: ({blackboard}) => blackboard.get('hasTarget'),
        },
        actions: {
          retreat: ({dt, blackboard}) => {
            this.x[i] += dt * .95;
            blackboard.set('decisions', blackboard.get('decisions') + 1);
            return 'running';
          },
          attack: ({dt, blackboard}) => {
            this.x[i] += (this.x[i]! < 0 ? 1 : -1) * dt * .85;
            blackboard.set('decisions', blackboard.get('decisions') + 1);
            return 'running';
          },
          patrol: ({dt, blackboard}) => {
            this.z[i] += Math.sin(blackboard.get('decisions') * .1 + i) * dt;
            blackboard.set('decisions', blackboard.get('decisions') + 1);
            return 'running';
          },
        },
      };
      const observer = i === 0 && this.recorder ? {observer: this.recorder} : undefined;
      const agent = new Agent(compileGraph(graph, registry, observer), memory);
      let ticks = 0;
      this.scheduler.add({update: dt => {
        if (i === 0) this.recorder?.beginTick();
        ticks++;
        memory.set('hasTarget', ((ticks + i * 13) % 100) < 60);
        agent.tick(dt);
        this.decisions++;
      }}, {hz: i % 5 === 0 ? 5 : 20, maxStepsPerFrame: 2});
      if (i === 0) this.recorder?.watchBlackboard(memory);
    }
    scene.add(this.mesh);
    this.updateMatrices();
  }
  update(dt: number): SchedulerStats {
    const result = this.scheduler.tick(dt);
    this.updateMatrices();
    return result;
  }
  private updateMatrices(): void {
    for (let i = 0; i < this.count; i++) {
      this.dummy.position.set(this.x[i]!, 0.5, this.z[i]!);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose(): void {
    this.scheduler.clear();
    this.recorder?.dispose();
    scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}

interface Sample {
  readonly frameIntervalMs: number;
  readonly aiCpuMs: number;
  readonly renderCpuMs: number;
}
type EndReason = 'manual' | 'duration';
interface Session {
  readonly startTime: number;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly workload: Workload;
  readonly samples: Sample[];
  updates: number;
  skippedSeconds: number;
  backgroundGapsMs: number;
  visibilityTransitions: number;
  firstFrame: boolean;
}
let session: Session | null = null;
let lastFrameAt = 0;
let lastReport: object | null = null;
let framesSinceUi = 0;
document.addEventListener('visibilitychange', () => {
  if (session) session.visibilityTransitions++;
});

function start(): void {
  if (session) return;
  const count = Number(agentSelect.value);
  const minutes = Number(minutesSelect.value);
  if (![50, 100, 250, 500].includes(count) || ![0.5, 1, 10, 30].includes(minutes)) {
    progressEl.textContent = 'Invalid benchmark configuration';
    return;
  }
  const workload = new Workload(count, traceCheckbox.checked);
  session = {
    workload, startTime: performance.now(), startedAt: new Date().toISOString(),
    durationMs: minutes * 60_000, samples: [], firstFrame: true,
    updates: 0, skippedSeconds: 0, backgroundGapsMs: 0, visibilityTransitions: 0,
  };
  lastFrameAt = 0;
  runtimeErrors.length = 0;
  contextHistory.length = 0;
  contextLosses = 0;
  contextRestores = 0;
  reportEl.value = '';
  lastReport = null;
  downloadButton.disabled = true;
  copyButton.disabled = true;
  startButton.disabled = true;
  stopButton.disabled = false;
  agentSelect.disabled = true;
  minutesSelect.disabled = true;
  traceCheckbox.disabled = true;
  progressEl.textContent = 'Running ' + count + ' NPCs…';
}
function stop(reason: EndReason): void {
  const finished = session;
  if (!finished) return;
  session = null;
  finished.workload.dispose();
  const frames = finished.samples;
  const usedHeap = (performance as Performance & {memory?: {usedJSHeapSize?: number}}).memory?.usedJSHeapSize;
  const report = {
    schema: 1,
    name: 'Instinct Mobile Browser Performance',
    start: finished.startedAt,
    end: new Date().toISOString(),
    reason,
    userAgent: navigator.userAgent,
    viewport: {width: viewport.clientWidth, height: viewport.clientHeight, dpr: renderer.getPixelRatio()},
    workload: {
      npcCount: finished.workload.count,
      tracedAgents: finished.workload.traced ? 1 : 0,
      activeAiHz: 20, distantAiHz: 5,
      nodeCount: graph.nodes.length,
      geometry: 'shared box mesh / instanced WebGL (placeholder workload)',
    },
    metrics: {
      frameInterval: summarize(frames.map(s => s.frameIntervalMs)),
      aiCpu: summarize(frames.map(s => s.aiCpuMs)),
      renderCpu: summarize(frames.map(s => s.renderCpuMs)),
      aiUpdates: finished.updates,
      skippedAiSimulationSeconds: Number(finished.skippedSeconds.toFixed(3)),
      backgroundFrameGapSeconds: Number((finished.backgroundGapsMs / 1000).toFixed(3)),
      visibilityTransitions: finished.visibilityTransitions,
      webglContextLost: contextLosses,
      webglContextRestored: contextRestores,
      textures: renderer.info.memory.textures,
      geometries: renderer.info.memory.geometries,
      javascriptHeapBytes: usedHeap ?? null,
    },
    errors: [...runtimeErrors],
    contextHistory: [...contextHistory],
    caveat: 'CPU-side browser diagnostics only. No reliable GPU memory bytes, device thermals or battery measurement. Placeholder NPC scene is not equivalent to production KL Rush.',
  };
  lastReport = report;
  reportEl.value = JSON.stringify(report, null, 2);
  startButton.disabled = false;
  stopButton.disabled = true;
  agentSelect.disabled = false;
  minutesSelect.disabled = false;
  traceCheckbox.disabled = false;
  downloadButton.disabled = false;
  copyButton.disabled = false;
  progressEl.textContent = (reason === 'duration' ? 'Completed' : 'Stopped') + ': ' +
    frames.length + ' frame samples · ' + finished.updates + ' AI updates';
}
function reset(): void {
  if (session) stop('manual');
  lastReport = null;
  reportEl.value = '';
  downloadButton.disabled = true;
  copyButton.disabled = true;
  metricsEl.textContent = 'Waiting for first frame…';
  progressEl.textContent = 'Ready to run';
}
startButton.addEventListener('click', start);
stopButton.addEventListener('click', () => stop('manual'));
resetButton.addEventListener('click', reset);
downloadButton.addEventListener('click', () => {
  if (!lastReport) return;
  const blob = new Blob([JSON.stringify(lastReport, null, 2)], {type: 'application/json'});
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = 'instinct-device-benchmark-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
});
copyButton.addEventListener('click', () => {
  if (!lastReport) return;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(reportEl.value).then(() => {
      progressEl.textContent = 'JSON copied. Reports remain local until you share them.';
    }).catch(() => {
      reportEl.focus();
      reportEl.select();
      progressEl.textContent = 'Select and copy the report manually.';
    });
  } else {
    reportEl.focus();
    reportEl.select();
    progressEl.textContent = 'Select and copy the report manually.';
  }
});

function frame(timestamp: number): void {
  requestAnimationFrame(frame);
  const active = session;
  const rawFrameMs = lastFrameAt > 0 ? timestamp - lastFrameAt : 1000 / 60;
  lastFrameAt = timestamp;
  let aiMs = 0;
  let renderMs = 0;
  if (active) {
    const aiStart = performance.now();
    const stats = active.workload.update(Math.min(rawFrameMs / 1000, .25));
    aiMs = performance.now() - aiStart;
    active.updates += stats.updates;
    active.skippedSeconds += stats.discardedSeconds;
    active.backgroundGapsMs += Math.max(0, rawFrameMs - 250);
  }
  const renderStart = performance.now();
  try {
    renderer.render(scene, camera);
  } catch (error) {
    if (runtimeErrors.length < 20) runtimeErrors.push(String(error).slice(0, 180));
  }
  renderMs = performance.now() - renderStart;
  if (active) {
    if (active.firstFrame) active.firstFrame = false;
    else active.samples.push({frameIntervalMs: rawFrameMs, aiCpuMs: aiMs, renderCpuMs: renderMs});
    framesSinceUi++;
    if (framesSinceUi >= 30) {
      framesSinceUi = 0;
      const elapsed = performance.now() - active.startTime;
      const sampled = active.samples;
      const latest = sampled.slice(-120);
      const frameStats = summarize(latest.map(s => s.frameIntervalMs));
      const aiStats = summarize(latest.map(s => s.aiCpuMs));
      progressEl.textContent = 'Running ' + active.workload.count + ' NPCs · ' +
        Math.round(elapsed / 1000) + ' / ' + Math.round(active.durationMs / 1000) + ' seconds';
      metricsEl.textContent =
        'recent frame p95: ' + frameStats.p95Ms.toFixed(2) + 'ms' +
        ' · recent AI p95: ' + aiStats.p95Ms.toFixed(3) + 'ms' +
        ' · AI updates: ' + active.updates +
        ' · texture objects: ' + renderer.info.memory.textures +
        ' · WebGL losses: ' + contextLosses +
        ' · dropped sim: ' + active.skippedSeconds.toFixed(2) + 's';
    }
    if (performance.now() - active.startTime >= active.durationMs) stop('duration');
  }
}
requestAnimationFrame(frame);
window.addEventListener('pagehide', () => {
  if (session) stop('manual');
});
