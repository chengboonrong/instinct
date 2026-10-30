import * as THREE from 'three';
import {Agent} from '@instinct/core';
import {BlackboardStore} from '@instinct/blackboard';
import {compileGraph, sampleGraph, type BehaviorRegistry} from '@instinct/definition';
import {TraceRecorder} from '@instinct/devtools';
import {DevtoolsPublisher} from '@instinct/bridge';
import {AgentScheduler, moveTowards, turnTowards} from '@instinct/three';

interface Memory {health: number; hasTarget: boolean; events: string[]}
const graph = sampleGraph();
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101926);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 12, 15);
camera.lookAt(0, 0, 0);
const renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff, 0x567080, 2));
const floor = new THREE.Mesh(new THREE.PlaneGeometry(22, 20), new THREE.MeshStandardMaterial({color: 0x21333a}));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
const player = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 0.8), new THREE.MeshStandardMaterial({color: 0x5acbff}));
player.position.set(0, 0.7, 0);
scene.add(player);

let publisher: DevtoolsPublisher | null = null;
type DebugNPC = {id: string; label: string; health: () => number; hurt: () => void; dispose: () => void};
const scheduler = new AgentScheduler();
function createNpc(id: string, label: string, x: number, color: number): DebugNPC {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 0.8), new THREE.MeshStandardMaterial({color}));
  mesh.position.set(x, 0.7, -1);
  scene.add(mesh);
  const memory = new BlackboardStore<Memory>({health: 100, hasTarget: false, events: []});
  const recorder = new TraceRecorder({capacity: 96});
  recorder.watchBlackboard(memory);
  let waypoint = 0;
  const patrolPoints = [new THREE.Vector3(x, 0, -3), new THREE.Vector3(x, 0, 3)];
  const registry: BehaviorRegistry<typeof memory> = {
    conditions: {
      lowHealth: ({blackboard}) => blackboard.get('health') < 30,
      hasTarget: ({blackboard}) => blackboard.get('hasTarget'),
    },
    actions: {
      patrol: ({dt}) => {
        if (moveTowards(mesh, patrolPoints[waypoint]!, {speed: 1.1, dt})) waypoint = 1 - waypoint;
        return 'running';
      },
      attack: ({dt}) => {
        turnTowards(mesh, player.position, Math.PI * 2, dt);
        moveTowards(mesh, player.position, {speed: 2.2, dt, tolerance: 1.5});
        return 'running';
      },
      retreat: ({dt}) => {
        const direction = new THREE.Vector3().subVectors(mesh.position, player.position).setY(0);
        if (direction.lengthSq() < 0.01) direction.set(1, 0, 0);
        direction.normalize().multiplyScalar(3).add(mesh.position);
        moveTowards(mesh, direction, {speed: 2.5, dt});
        return 'running';
      },
    },
  };
  const agent = new Agent(compileGraph(graph, registry, {observer: recorder}), memory);
  const unregister = scheduler.add({
    update(dt) {
      recorder.beginTick();
      memory.set('hasTarget', mesh.position.distanceTo(player.position) < 5);
      agent.tick(dt);
      publisher?.publish({id, label, graph, trace: recorder.snapshot()});
    },
  }, {hz: 20, maxStepsPerFrame: 2});
  return {
    id, label, health: () => memory.get('health'),
    hurt: () => memory.set('health', Math.max(0, memory.get('health') - 20)),
    dispose() {unregister(); agent.stop(); recorder.dispose(); publisher?.remove(id); scene.remove(mesh);},
  };
}
const guards = [
  createNpc('guard-one', 'Market Guard', -3.5, 0xff887b),
  createNpc('guard-two', 'Rooftop Guard', 3.5, 0xf1bf6a),
];
const status = document.getElementById('bridge-status')!;
const button = document.getElementById('bridge-connect') as HTMLButtonElement;
button.addEventListener('click', () => {
  publisher?.close();
  const token = (document.getElementById('bridge-token') as HTMLInputElement).value;
  try {
    publisher = new DevtoolsPublisher({
      token,
      onEvent(event) {
        if (event.type === 'connected') status.textContent = 'Connected; publishing two live NPCs';
        else if (event.type === 'disconnected') status.textContent = 'Relay disconnected';
        else if (event.type === 'error') status.textContent = event.message;
      },
    });
    status.textContent = 'Connecting to loopback development bridge…';
    publisher.connect();
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'Connection failed';
  }
});
const keys = new Set<string>();
window.addEventListener('keydown', event => {
  keys.add(event.key.toLowerCase());
  if (event.repeat) return;
  if (event.key === '1') guards[0]!.hurt();
  if (event.key === '2') guards[1]!.hurt();
});
window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());
const clock = new THREE.Clock();
const scoreboard = document.getElementById('scoreboard')!;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);
  const dx = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
  const dz = Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'));
  const unit = Math.hypot(dx, dz) || 1;
  player.position.x = THREE.MathUtils.clamp(player.position.x + dx / unit * dt * 4, -10, 10);
  player.position.z = THREE.MathUtils.clamp(player.position.z + dz / unit * dt * 4, -9, 9);
  scheduler.tick(dt);
  scoreboard.textContent = guards.map(npc => npc.label + ' HP ' + npc.health()).join(' · ');
  renderer.render(scene, camera);
}
frame();
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
window.addEventListener('pagehide', () => {
  for (const npc of guards) npc.dispose();
  publisher?.close();
});
