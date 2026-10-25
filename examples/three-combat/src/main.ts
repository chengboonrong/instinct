import * as THREE from 'three';
import {Action, Agent} from '@instinct/core';
import {BlackboardStore} from '@instinct/blackboard';
import {StateMachine, type MachineConfig} from '@instinct/hsm';
import {AgentScheduler, moveTowards, ThreeAgent, turnTowards} from '@instinct/three';

interface EnemyData {
  health: number;
  distance: number;
  target: THREE.Vector3 | null;
  playerHealth: number;
}
type EnemyEvent = {type: 'DETECT' | 'LOST' | 'IN_RANGE' | 'OUT_OF_RANGE' | 'DIE'};
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111a27);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 12, 16);
camera.lookAt(0, 0, 0);
const renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff, 0x40506a, 2));
const floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 20), new THREE.MeshStandardMaterial({color: 0x253942}));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
const player = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, 0.8), new THREE.MeshStandardMaterial({color: 0x4ec7ff}));
player.position.set(5, 0.8, 0);
scene.add(player);
const enemy = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, 0.8), new THREE.MeshStandardMaterial({color: 0xff736a}));
enemy.position.set(-4, 0.8, 0);
scene.add(enemy);

const world = new BlackboardStore<EnemyData>({health: 100, distance: Infinity, target: null, playerHealth: 100});
const data = world.fork();
const config: MachineConfig<BlackboardStore<EnemyData>, EnemyEvent> = {
  initial: 'patrol',
  states: {
    patrol: {on: {DETECT: 'combat.chase', DIE: 'dead'}},
    combat: {
      initial: 'chase',
      on: {LOST: 'patrol', DIE: 'dead'},
      states: {
        chase: {on: {IN_RANGE: 'combat.attack'}},
        attack: {on: {OUT_OF_RANGE: 'combat.chase'}},
      },
    },
    dead: {},
  },
};
const machine = new StateMachine(config, data);
const patrolLocations = [new THREE.Vector3(-4, 0, -3), new THREE.Vector3(-4, 0, 3)];
let patrolIndex = 0;
const patrol = new Agent(new Action<typeof data>(({dt}) => {
  if (moveTowards(enemy, patrolLocations[patrolIndex]!, {speed: 1.25, dt})) patrolIndex = 1 - patrolIndex;
  return 'running';
}), data);
const chase = new Agent(new Action<typeof data>(({dt, blackboard}) => {
  const target = blackboard.get('target');
  if (!target) return 'failure';
  turnTowards(enemy, target, Math.PI * 2, dt);
  moveTowards(enemy, target, {speed: 2.8, dt, tolerance: 1.25});
  return 'running';
}), data);
let strikeCooldown = 0;
const attack = new Agent(new Action<typeof data>(({dt, blackboard}) => {
  const target = blackboard.get('target');
  if (!target) return 'failure';
  turnTowards(enemy, target, Math.PI * 3, dt);
  strikeCooldown += dt;
  if (strikeCooldown >= 0.8) {
    blackboard.set('playerHealth', Math.max(0, blackboard.get('playerHealth') - 8));
    strikeCooldown = 0;
  }
  return 'running';
}, () => {strikeCooldown = 0;}), data);

const npc = new ThreeAgent<EnemyData, EnemyEvent>({
  object: enemy,
  blackboard: data,
  machine,
  behaviors: {patrol, 'combat.chase': chase, 'combat.attack': attack},
  sense(controller) {
    const health = data.get('health');
    if (health <= 0) {
      if (!machine.matches('dead')) controller.send({type: 'DIE'});
      return;
    }
    const distance = enemy.position.distanceTo(player.position);
    data.set('distance', distance);
    data.set('target', player.position);
    if (machine.matches('patrol') && distance < 5) controller.send({type: 'DETECT'});
    else if (machine.matches('combat') && distance > 7) controller.send({type: 'LOST'});
    else if (machine.matches('combat.chase') && distance < 1.6) controller.send({type: 'IN_RANGE'});
    else if (machine.matches('combat.attack') && distance > 2.1) controller.send({type: 'OUT_OF_RANGE'});
  },
});
npc.start();
const scheduler = new AgentScheduler();
scheduler.add(npc, {hz: 20, maxStepsPerFrame: 2, maxAccumulatedSeconds: 0.2});
const pressed = new Set<string>();
addEventListener('keydown', event => {
  pressed.add(event.key.toLowerCase());
  if (event.key.toLowerCase() === 'f' && npc.running && data.get('health') > 0 && enemy.position.distanceTo(player.position) < 2.5) {
    const health = Math.max(0, data.get('health') - 20);
    data.set('health', health);
    if (health === 0) npc.send({type: 'DIE'});
  }
});
addEventListener('keyup', event => pressed.delete(event.key.toLowerCase()));
addEventListener('blur', () => pressed.clear());
const clock = new THREE.Clock();
const hud = document.querySelector<HTMLElement>('#stats')!;
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  const dx = Number(pressed.has('d') || pressed.has('arrowright')) - Number(pressed.has('a') || pressed.has('arrowleft'));
  const dz = Number(pressed.has('s') || pressed.has('arrowdown')) - Number(pressed.has('w') || pressed.has('arrowup'));
  const magnitude = Math.hypot(dx, dz) || 1;
  player.position.x = THREE.MathUtils.clamp(player.position.x + (dx / magnitude) * 4 * dt, -12, 12);
  player.position.z = THREE.MathUtils.clamp(player.position.z + (dz / magnitude) * 4 * dt, -9, 9);
  scheduler.tick(dt);
  hud.textContent = `Enemy state: ${machine.state} | Enemy HP: ${data.get('health')} | Player HP: ${data.get('playerHealth')}`;
  renderer.render(scene, camera);
}
animate();
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
