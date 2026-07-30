import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { PRODUCT_BY_FAMILY } from "../data/estimator-products.mjs";
import { wallLength } from "./estimator-draft2-core.mjs";
import { clampObjectToArea, snap } from "./estimator-draft2-plan.mjs";

function material(colour, options = {}) {
  return new THREE.MeshStandardMaterial({
    color: colour,
    roughness: options.roughness ?? 0.55,
    metalness: options.metalness ?? 0,
    transparent: Boolean(options.transparent),
    opacity: options.opacity ?? 1,
    side: options.side ?? THREE.FrontSide,
    depthWrite: options.depthWrite ?? true,
  });
}

function box(width, height, depth, colour, options = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material(colour, options));
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  return mesh;
}

function add(group, mesh, x, y, z) {
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

function fixture3D(object) {
  const product = PRODUCT_BY_FAMILY[object.family];
  const group = new THREE.Group();
  group.userData = { id: object.id, selectable: true };
  const width = object.dimensions.width / 1000;
  const depth = object.dimensions.depth / 1000;
  const height = object.dimensions.height / 1000;
  const white = "#f7f6f0";
  const glass = "#a9d8e2";
  const chrome = "#a9aaa8";
  if (product?.modelKind?.startsWith("toilet")) {
    const bowlHeight = Math.min(0.42, height * 0.55);
    add(group, new THREE.Mesh(new THREE.CylinderGeometry(width * 0.34, width * 0.42, bowlHeight, 28), material(white)), 0, bowlHeight / 2, depth * 0.08);
    if (product.modelKind === "toilet-coupled") add(group, box(width * 0.92, height * 0.48, depth * 0.32, white), 0, height * 0.7, -depth * 0.3);
  } else if (product?.modelKind === "vanity") {
    add(group, box(width, height * 0.82, depth, object.colour || "#8d765c"), 0, height * 0.41, 0);
    add(group, box(width * 1.02, height * 0.16, depth * 1.03, white), 0, height * 0.9, 0);
  } else if (product?.modelKind === "basin-wall" || product?.modelKind === "basin-free") {
    add(group, box(width, Math.max(0.16, height * 0.2), depth, white), 0, Math.max(0.78, height * 0.75), 0);
  } else if (product?.modelKind?.includes("enclosure")) {
    add(group, box(width, 0.065, depth, white), 0, 0.032, 0);
    add(group, box(width, height, 0.016, glass, { transparent: true, opacity: 0.26, depthWrite: false }), 0, height / 2, -depth / 2);
    add(group, box(0.016, height, depth, glass, { transparent: true, opacity: 0.26, depthWrite: false }), -width / 2, height / 2, 0);
  } else if (product?.modelKind === "bath") {
    add(group, box(width, height, depth, white), 0, height / 2, 0);
    add(group, box(width * 0.82, 0.07, depth * 0.64, "#c7e1e5"), 0, height * 0.94, 0);
  } else if (product?.modelKind === "towel-rail") {
    for (let y = 0.15; y < height; y += 0.12) add(group, box(width, 0.018, Math.max(depth, 0.035), chrome, { metalness: 0.65 }), 0, y, 0);
    add(group, box(0.025, height, depth, chrome, { metalness: 0.65 }), -width / 2, height / 2, 0);
    add(group, box(0.025, height, depth, chrome, { metalness: 0.65 }), width / 2, height / 2, 0);
  } else if (product?.modelKind === "door") {
    add(group, box(width, height, Math.max(depth, 0.045), object.colour || "#9c7449"), 0, height / 2, 0);
  } else if (product?.modelKind === "window") {
    add(group, box(width, height, Math.max(depth, 0.05), glass, { transparent: true, opacity: 0.5, depthWrite: false }), 0, 1.25, 0);
  } else {
    add(group, box(width, Math.max(height, 0.12), depth, object.colour || "#8d8275"), 0, Math.max(height, 0.12) / 2, 0);
  }
  const hitbox = box(width, Math.max(height, 0.18), depth, "#ffffff", { transparent: true, opacity: 0.001, castShadow: false, receiveShadow: false, depthWrite: false });
  hitbox.position.y = Math.max(height, 0.18) / 2;
  hitbox.userData = { id: object.id, selectable: true };
  group.add(hitbox);
  group.position.set(object.position.x, object.position.y || 0, object.position.z);
  group.rotation.y = THREE.MathUtils.degToRad(object.rotation || 0);
  return group;
}

export class SimpleRoom3D {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.objectGroups = new Map();
    this.state = null;
    this.selectedId = null;
    this.drag = null;
    this.pointer = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#f1eee8");
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.03, 60);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute("aria-label", "Interactive 3D room. Drag a fixture to move it; drag empty space to orbit.");
    container.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.zoomToCursor = true;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 24;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.selectionBox = null;
    this.scene.add(new THREE.HemisphereLight("#fffaf1", "#817d76", 2.25));
    const key = new THREE.DirectionalLight("#fff5dc", 3.6);
    key.position.set(4, 8, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    this.scene.add(key);
    this.bind();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
    this.fitCamera();
  }

  bind() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", (event) => {
      const id = this.pickId(event.clientX, event.clientY);
      if (!id) {
        this.drag = null;
        this.controls.enabled = true;
        this.callbacks.onSelect?.(null);
        this.setSelection(null);
        return;
      }
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      const object = this.state.objects.find((item) => item.id === id);
      const point = this.screenToFloor(event.clientX, event.clientY);
      this.drag = { pointerId: event.pointerId, id, offsetX: object.position.x - point.x, offsetZ: object.position.z - point.z };
      this.controls.enabled = false;
      this.setSelection(id);
      this.callbacks.onDragStart?.(id);
      this.callbacks.onSelect?.(id);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!this.drag || this.drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      const object = this.state.objects.find((item) => item.id === this.drag.id);
      if (!object) return;
      const point = this.screenToFloor(event.clientX, event.clientY);
      object.position.x = snap(point.x + this.drag.offsetX);
      object.position.z = snap(point.z + this.drag.offsetZ);
      clampObjectToArea(object, this.state);
      this.moveObject(object);
      this.callbacks.onDrag?.(object);
    });
    const end = (event) => {
      if (!this.drag || this.drag.pointerId !== event.pointerId) return;
      this.drag = null;
      this.controls.enabled = true;
      try { canvas.releasePointerCapture(event.pointerId); } catch { /* already released */ }
      this.callbacks.onDragEnd?.();
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
  }

  resize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  clear() {
    if (this.selectionBox) {
      this.root.remove(this.selectionBox);
      this.selectionBox.geometry?.dispose?.();
      this.selectionBox.material?.dispose?.();
      this.selectionBox = null;
    }
    while (this.root.children.length) {
      const child = this.root.children.pop();
      child.traverse((node) => {
        node.geometry?.dispose?.();
        if (node.material) {
          const materials = Array.isArray(node.material) ? node.material : [node.material];
          materials.forEach((entry) => entry.dispose?.());
        }
      });
    }
    this.objectGroups.clear();
  }

  render(state) {
    this.state = state;
    this.selectedId = state.selected?.type === "object" ? state.selected.id : null;
    this.clear();
    const { width, length, height } = state.room;
    const floor = box(width, 0.06, length, "#c9bba8", { castShadow: false });
    floor.position.y = -0.03;
    this.root.add(floor);
    const grid = new THREE.GridHelper(Math.max(width, length), Math.max(4, Math.ceil(Math.max(width, length) * 4)), "#9e8240", "#d8d0c5");
    grid.position.y = 0.005;
    grid.material.opacity = 0.28;
    grid.material.transparent = true;
    this.root.add(grid);
    const wallOptions = { transparent: true, opacity: 0.58, side: THREE.DoubleSide, castShadow: false };
    const north = box(width, height, 0.07, "#ded8ce", wallOptions);
    north.position.set(0, height / 2, length / 2);
    this.root.add(north);
    const west = box(0.07, height, length, "#ded8ce", wallOptions);
    west.position.set(-width / 2, height / 2, 0);
    this.root.add(west);
    const east = box(0.07, height, length, "#ded8ce", { ...wallOptions, opacity: 0.24 });
    east.position.set(width / 2, height / 2, 0);
    this.root.add(east);
    if (state.zone) this.renderZone(state.zone);
    state.walls.forEach((wall) => this.renderWall(wall));
    state.objects.forEach((object) => {
      const group = fixture3D(object);
      this.root.add(group);
      this.objectGroups.set(object.id, group);
    });
    this.setSelection(this.selectedId);
  }

  renderZone(zone) {
    const centreX = zone.x + zone.width / 2;
    const centreZ = zone.z + zone.depth / 2;
    const options = { transparent: true, opacity: 0.55, side: THREE.DoubleSide };
    const colour = "#d4bd69";
    const walls = [
      [box(zone.width, zone.height, zone.wallThickness, colour, options), centreX, zone.height / 2, zone.z + zone.depth],
      [box(zone.width, zone.height, zone.wallThickness, colour, { ...options, opacity: 0.28 }), centreX, zone.height / 2, zone.z],
      [box(zone.wallThickness, zone.height, zone.depth, colour, options), zone.x, zone.height / 2, centreZ],
      [box(zone.wallThickness, zone.height, zone.depth, colour, { ...options, opacity: 0.28 }), zone.x + zone.width, zone.height / 2, centreZ],
    ];
    walls.forEach(([mesh, x, y, z]) => { mesh.position.set(x, y, z); this.root.add(mesh); });
  }

  renderWall(wall) {
    const length = wallLength(wall);
    if (length < 0.05) return;
    const centreX = (wall.x1 + wall.x2) / 2;
    const centreZ = (wall.z1 + wall.z2) / 2;
    const angle = Math.atan2(wall.z2 - wall.z1, wall.x2 - wall.x1);
    const mesh = box(length, wall.height, wall.thickness, "#bdb4a7", { transparent: true, opacity: 0.86, side: THREE.DoubleSide });
    mesh.position.set(centreX, wall.height / 2, centreZ);
    mesh.rotation.y = -angle;
    this.root.add(mesh);
  }

  pickId(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects([...this.objectGroups.values()], true);
    for (const hit of hits) {
      let target = hit.object;
      while (target && target !== this.root) {
        if (target.userData?.id) return target.userData.id;
        target = target.parent;
      }
    }
    return null;
  }

  screenToFloor(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const target = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), target);
    return target;
  }

  setSelection(id) {
    this.selectedId = id;
    if (this.selectionBox) {
      this.root.remove(this.selectionBox);
      this.selectionBox.geometry?.dispose?.();
      this.selectionBox.material?.dispose?.();
      this.selectionBox = null;
    }
    const group = id ? this.objectGroups.get(id) : null;
    if (!group) return;
    this.selectionBox = new THREE.BoxHelper(group, new THREE.Color("#a9821e"));
    this.selectionBox.material.depthTest = false;
    this.selectionBox.renderOrder = 20;
    this.root.add(this.selectionBox);
  }

  moveObject(object) {
    const group = this.objectGroups.get(object.id);
    if (!group) return;
    group.position.set(object.position.x, object.position.y || 0, object.position.z);
    group.rotation.y = THREE.MathUtils.degToRad(object.rotation || 0);
    this.selectionBox?.update?.();
  }

  fitCamera() {
    const room = this.state?.room || { width: 2.1, length: 2.45, height: 2.4 };
    const span = Math.max(room.width, room.length);
    this.camera.position.set(span * 1.15, Math.max(2.6, span * 0.95), span * 1.25);
    this.controls.target.set(0, Math.min(0.8, room.height * 0.35), 0);
    this.controls.update();
  }
}
