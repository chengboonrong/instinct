import * as THREE from 'three';
import { Action, Agent, Sequence } from '@instinct/core';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x171b27);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 5, 9);
camera.lookAt(0, 0, 0);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 2));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.MeshStandardMaterial({ color: 0x263b39 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const guard = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.2, 0.65), new THREE.MeshStandardMaterial({ color: 0x72c9ff }));
guard.position.y = 0.6;
scene.add(guard);
const waypoints = [-3, 3];
let target = 0;
const ai = new Agent(new Sequence([
  new Action(({ dt }) => {
    const goal = waypoints[target]!;
    guard.position.x = THREE.MathUtils.damp(guard.position.x, goal, 2, dt);
    if (Math.abs(guard.position.x - goal) < 0.05) { target = 1 - target; return 'success'; }
    return 'running';
  })
]), {});
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  ai.tick(Math.min(clock.getDelta(), 0.05));
  renderer.render(scene, camera);
}
frame();
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
