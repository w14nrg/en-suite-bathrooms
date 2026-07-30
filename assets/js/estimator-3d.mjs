import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { PRODUCT_BY_FAMILY } from "../data/estimator-products.mjs";
import { collisionWarnings, workArea } from "./estimator-core.mjs";

const METAL = 0.72;
const ROUGH = 0.5;

function material(colour, options = {}) {
  return new THREE.MeshStandardMaterial({
    color: colour,
    roughness: options.roughness ?? ROUGH,
    metalness: options.metalness ?? 0,
    transparent: Boolean(options.transparent),
    opacity: options.opacity ?? 1,
    side: options.side ?? THREE.FrontSide,
    depthWrite: options.depthWrite ?? true,
  });
}

function box(width, height, depth, colour, options = {}) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    material(colour, options),
  );
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  return mesh;
}

function cylinder(radiusTop, radiusBottom, height, colour, options = {}) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 28),
    material(colour, options),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function addAt(group, mesh, x, y, z, rotation = {}) {
  mesh.position.set(x, y, z);
  mesh.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
  group.add(mesh);
  return mesh;
}

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((entry) => entry.dispose?.());
    }
  });
}

function createGenericProduct(object) {
  const definition = PRODUCT_BY_FAMILY[object.family];
  const group = new THREE.Group();
  group.name = object.label;
  group.userData = { id: object.id, type: "product", family: object.family };

  const width = object.dimensions.width / 1000;
  const depth = object.dimensions.depth / 1000;
  const height = object.dimensions.height / 1000;
  const colour = object.colour || definition?.colour || "#f2f0e9";
  const white = "#f7f6f0";
  const chrome = "#aaa9a4";
  const glass = "#a9d8e2";

  switch (definition?.modelKind) {
    case "toilet-wall":
    case "toilet-back":
    case "toilet-coupled": {
      const bowlHeight = Math.min(height * 0.54, 0.43);
      addAt(
        group,
        cylinder(width * 0.42, width * 0.34, bowlHeight, white),
        0,
        bowlHeight / 2,
        depth * 0.1,
      );
      const seat = cylinder(width * 0.43, width * 0.43, 0.045, "#deddd8");
      seat.scale.z = Math.max(1, depth / Math.max(width, 0.01) * 0.82);
      addAt(group, seat, 0, bowlHeight + 0.02, depth * 0.1);
      if (definition.modelKind === "toilet-coupled") {
        addAt(
          group,
          box(width * 0.92, height * 0.54, depth * 0.3, white),
          0,
          height * 0.73,
          -depth * 0.32,
        );
      }
      break;
    }
    case "frame":
      addAt(group, box(width, height, depth, "#4d555c"), 0, height / 2, 0);
      for (const x of [-width * 0.35, width * 0.35]) {
        addAt(group, box(0.035, height * 0.94, 0.035, chrome, { metalness: METAL }), x, height / 2, depth * 0.52);
      }
      break;
    case "basin-wall": {
      const basin = box(width, Math.max(0.13, height), depth, white);
      basin.geometry.translate(0, 0, 0);
      addAt(group, basin, 0, 0.82, 0);
      addAt(group, cylinder(0.025, 0.025, 0.18, chrome, { metalness: METAL }), 0, 0.98, -depth * 0.18);
      break;
    }
    case "basin-free":
      addAt(group, cylinder(width * 0.22, width * 0.32, height * 0.82, white), 0, height * 0.41, 0);
      addAt(group, cylinder(width * 0.48, width * 0.4, height * 0.18, white), 0, height * 0.91, 0);
      break;
    case "vanity":
      addAt(group, box(width, height * 0.82, depth, colour), 0, height * 0.41, 0);
      addAt(group, box(width * 1.02, height * 0.18, depth * 1.03, white), 0, height * 0.91, 0);
      addAt(group, box(width * 0.34, 0.018, 0.018, chrome, { metalness: METAL }), 0, height * 0.58, depth * 0.51);
      break;
    case "tray":
      addAt(group, box(width, height, depth, white), 0, height / 2, 0);
      addAt(group, cylinder(0.045, 0.045, 0.008, "#6e7478", { metalness: METAL }), width * 0.32, height + 0.005, depth * 0.32);
      break;
    case "enclosure-square":
    case "enclosure-rect": {
      addAt(group, box(width, 0.065, depth, white), 0, 0.0325, 0);
      const panelOptions = { transparent: true, opacity: 0.28, roughness: 0.1, depthWrite: false, castShadow: false };
      addAt(group, box(width, height, 0.015, glass, panelOptions), 0, height / 2, -depth / 2);
      addAt(group, box(0.015, height, depth, glass, panelOptions), -width / 2, height / 2, 0);
      break;
    }
    case "enclosure-quadrant": {
      addAt(group, box(width, 0.065, depth, white), 0, 0.0325, 0);
      const curve = new THREE.Mesh(
        new THREE.CylinderGeometry(width * 0.5, width * 0.5, height, 32, 1, true, 0, Math.PI / 2),
        material(glass, { transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
      );
      curve.position.set(-width / 2, height / 2, -depth / 2);
      group.add(curve);
      break;
    }
    case "screen":
      addAt(
        group,
        box(width, height, Math.max(depth, 0.02), glass, {
          transparent: true,
          opacity: 0.3,
          roughness: 0.1,
          depthWrite: false,
          castShadow: false,
        }),
        0,
        height / 2,
        0,
      );
      addAt(group, box(0.025, height, 0.025, chrome, { metalness: METAL }), -width / 2, height / 2, 0);
      break;
    case "bath": {
      addAt(group, box(width, height, depth, white), 0, height / 2, 0);
      addAt(
        group,
        box(width * 0.86, height * 0.13, depth * 0.7, "#c7e1e5", {
          roughness: 0.15,
          castShadow: false,
        }),
        0,
        height * 0.92,
        0,
      );
      break;
    }
    case "tap":
      addAt(group, cylinder(width * 0.18, width * 0.22, height * 0.72, chrome, { metalness: METAL }), 0, height * 0.36, 0);
      addAt(group, box(width * 0.18, 0.04, depth * 0.75, chrome, { metalness: METAL }), 0, height * 0.7, depth * 0.22);
      break;
    case "shower-concealed":
    case "shower-exposed": {
      addAt(group, cylinder(0.018, 0.018, height, chrome, { metalness: METAL }), 0, height / 2, 0);
      const head = cylinder(width * 0.42, width * 0.42, 0.025, chrome, { metalness: METAL });
      addAt(group, head, 0, height, depth * 0.22);
      addAt(group, cylinder(width * 0.14, width * 0.14, 0.06, chrome, { metalness: METAL }), 0, height * 0.45, 0, { x: Math.PI / 2 });
      break;
    }
    case "towel-rail": {
      for (const x of [-width / 2, width / 2]) {
        addAt(group, cylinder(0.018, 0.018, height, chrome, { metalness: METAL }), x, height / 2, 0);
      }
      for (let y = height * 0.08; y < height; y += 0.11) {
        const rail = cylinder(0.012, 0.012, width, chrome, { metalness: METAL });
        addAt(group, rail, 0, y, 0, { z: Math.PI / 2 });
      }
      break;
    }
    case "mirror":
      addAt(group, box(width, height, Math.max(depth, 0.025), "#92b9c2", { metalness: 0.5, roughness: 0.12 }), 0, 1.25, 0);
      break;
    case "door":
      addAt(group, box(width, height, Math.max(depth, 0.035), colour), 0, height / 2, 0);
      addAt(group, cylinder(0.025, 0.025, 0.05, "#b9a04d", { metalness: METAL }), width * 0.38, height * 0.52, depth * 0.55, { x: Math.PI / 2 });
      break;
    case "window": {
      addAt(group, box(width, height, Math.max(depth, 0.04), "#8fc4d1", { transparent: true, opacity: 0.5, depthWrite: false }), 0, 1.25, 0);
      addAt(group, box(width, 0.045, depth * 1.4, "#f2f0e8"), 0, 1.25 - height / 2, 0);
      addAt(group, box(width, 0.045, depth * 1.4, "#f2f0e8"), 0, 1.25 + height / 2, 0);
      break;
    }
    case "rooflight":
      addAt(group, box(width, Math.max(height, 0.04), depth, glass, { transparent: true, opacity: 0.45, depthWrite: false }), 0, 2.2, 0);
      break;
    case "obstruction":
      addAt(group, box(width, height, depth, colour), 0, height / 2, 0);
      break;
    default:
      addAt(group, box(width, height, depth, colour), 0, height / 2, 0);
  }

  const hitbox = box(width, Math.max(height, 0.12), depth, "#ffffff", {
    transparent: true,
    opacity: 0.001,
    castShadow: false,
    receiveShadow: false,
    depthWrite: false,
  });
  hitbox.position.y = Math.max(height, 0.12) / 2;
  hitbox.userData.selectable = true;
  group.add(hitbox);
  group.position.set(object.position.x, object.position.y || 0, object.position.z);
  group.rotation.y = ((object.rotation || 0) * Math.PI) / 180;
  return group;
}

export class Bathroom3DEngine {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.currentProject = null;
    this.objectGroups = new Map();
    this.wallMeshes = [];
    this.selectedId = null;
    this.autoFadeWalls = true;
    this.walkMode = false;
    this.pointerStart = null;
    this.zoneDragStart = null;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#eee9df");
    this.scene.fog = new THREE.Fog("#eee9df", 10, 28);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.03, 80);
    this.camera.position.set(5.4, 4.2, 6.2);

    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch (error) {
      callbacks.onError?.(error);
      throw error;
    }
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.setAttribute("aria-label", "Interactive 3D bathroom view");
    this.renderer.domElement.tabIndex = 0;
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.zoomToCursor = true;
    this.controls.minDistance = 0.45;
    this.controls.maxDistance = 24;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.target.set(0, 0.7, 0);

    this.transform = new TransformControls(this.camera, this.renderer.domElement);
    this.transform.setTranslationSnap(0.05);
    this.transform.setRotationSnap(THREE.MathUtils.degToRad(15));
    this.transform.setSize(0.72);
    this.scene.add(this.transform.getHelper());

    this.transform.addEventListener("dragging-changed", (event) => {
      this.controls.enabled = !event.value;
      if (event.value && this.selectedId === "__ensuite__") {
        this.zoneDragStart = {
          x: this.transform.object.position.x,
          z: this.transform.object.position.z,
        };
      }
    });
    this.transform.addEventListener("objectChange", () => this.handleObjectTransform(false));
    this.transform.addEventListener("mouseUp", () => this.handleObjectTransform(true));

    this.dynamicRoot = new THREE.Group();
    this.scene.add(this.dynamicRoot);
    this.routeRoot = new THREE.Group();
    this.scene.add(this.routeRoot);
    this.annotationRoot = new THREE.Group();
    this.scene.add(this.annotationRoot);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.measurement = document.createElement("div");
    this.measurement.className = "estimator-room-measurement";
    this.measurement.setAttribute("aria-live", "polite");
    container.appendChild(this.measurement);

    this.addLighting();
    this.bindEvents();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.renderer.setAnimationLoop(() => this.animate());
  }

  addLighting() {
    this.scene.add(new THREE.HemisphereLight("#fff8e9", "#73716d", 2.2));
    const key = new THREE.DirectionalLight("#fff4d8", 4.3);
    key.position.set(4, 8, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -8;
    key.shadow.camera.right = 8;
    key.shadow.camera.top = 8;
    key.shadow.camera.bottom = -8;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight("#c9e5ff", 1.4);
    fill.position.set(-5, 3, -4);
    this.scene.add(fill);
  }

  bindEvents() {
    this.renderer.domElement.addEventListener("pointerdown", (event) => {
      this.pointerStart = { x: event.clientX, y: event.clientY };
    });
    this.renderer.domElement.addEventListener("pointerup", (event) => {
      if (!this.pointerStart) return;
      const moved = Math.hypot(
        event.clientX - this.pointerStart.x,
        event.clientY - this.pointerStart.y,
      );
      this.pointerStart = null;
      if (moved < 5 && !this.transform.dragging) this.pick(event.clientX, event.clientY);
    });
    this.renderer.domElement.addEventListener("keydown", (event) => {
      if (!this.walkMode) return;
      const moveKeys = ["w", "a", "s", "d", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
      if (!moveKeys.includes(event.key)) return;
      event.preventDefault();
      const direction =
        event.key === "w" || event.key === "ArrowUp"
          ? "forward"
          : event.key === "s" || event.key === "ArrowDown"
            ? "back"
            : event.key === "a" || event.key === "ArrowLeft"
              ? "left"
              : "right";
      this.moveWalk(direction);
    });
  }

  resize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  clearRoot(root) {
    while (root.children.length) {
      const child = root.children.pop();
      disposeObject(child);
    }
  }

  renderProject(project) {
    this.currentProject = project;
    const preserveSelection = this.selectedId;
    this.transform.detach();
    this.clearRoot(this.dynamicRoot);
    this.clearRoot(this.routeRoot);
    this.clearRoot(this.annotationRoot);
    this.objectGroups.clear();
    this.wallMeshes = [];

    this.renderOuterRoom(project);
    if (project.route === "newEnsuite" && project.ensuite) this.renderEnsuite(project);
    project.objects.forEach((object) => {
      const group = createGenericProduct(object);
      this.dynamicRoot.add(group);
      this.objectGroups.set(object.id, group);
    });
    this.renderServices(project);
    this.renderServiceRoutes(project);
    this.updateMeasurements();
    this.updateWarnings(collisionWarnings(project));

    if (preserveSelection && (this.objectGroups.has(preserveSelection) || preserveSelection === "__ensuite__")) {
      this.select(preserveSelection, false);
    } else {
      this.select(null, false);
    }
  }

  renderOuterRoom(project) {
    const { width, length, height } = project.room;
    const floor = box(width, 0.06, length, project.finishes.floorColour || "#b9aa96", {
      receiveShadow: true,
      castShadow: false,
    });
    floor.position.y = -0.03;
    floor.userData = { type: "floor" };
    this.dynamicRoot.add(floor);

    const grid = new THREE.GridHelper(Math.max(width, length), Math.ceil(Math.max(width, length) * 10), "#aa8d32", "#d8d0c3");
    grid.position.y = 0.004;
    grid.material.opacity = 0.22;
    grid.material.transparent = true;
    this.dynamicRoot.add(grid);

    const wallColour = project.finishes.wallColour || "#ded8ce";
    this.makeWall("north", 0, height / 2, length / 2, width, height, 0.08, wallColour, "outer");
    this.makeWall("south", 0, height / 2, -length / 2, width, height, 0.08, wallColour, "outer");
    this.makeWall("east", width / 2, height / 2, 0, 0.08, height, length, wallColour, "outer");
    this.makeWall("west", -width / 2, height / 2, 0, 0.08, height, length, wallColour, "outer");

    project.room.openings.forEach((opening) => this.renderOpening(opening, project.room));
    if (project.room.features?.slope?.enabled) this.renderSlope(project);
  }

  makeWall(side, x, y, z, width, height, depth, colour, shell) {
    const wall = box(width, height, depth, colour, {
      transparent: true,
      opacity: shell === "outer" ? 0.72 : 0.82,
      side: THREE.DoubleSide,
    });
    wall.position.set(x, y, z);
    wall.userData = {
      type: "wall",
      wallId: `${shell}-${side}`,
      side,
      shell,
      baseOpacity: shell === "outer" ? 0.72 : 0.82,
    };
    this.dynamicRoot.add(wall);
    this.wallMeshes.push(wall);
    return wall;
  }

  renderOpening(opening, room) {
    const group = new THREE.Group();
    group.userData = { type: "opening", id: opening.id };
    const isHorizontal = opening.wall === "north" || opening.wall === "south";
    const thickness = 0.055;
    const colour = opening.type === "door" ? "#9c7449" : "#9fcbd4";
    const panel = box(
      isHorizontal ? opening.width : thickness,
      opening.height,
      isHorizontal ? thickness : opening.width,
      colour,
      {
        transparent: opening.type === "window",
        opacity: opening.type === "window" ? 0.45 : 0.88,
        depthWrite: opening.type !== "window",
      },
    );
    panel.position.y = opening.sillHeight + opening.height / 2;
    if (opening.wall === "north") panel.position.set(opening.offset, panel.position.y, room.length / 2 - 0.055);
    if (opening.wall === "south") panel.position.set(opening.offset, panel.position.y, -room.length / 2 + 0.055);
    if (opening.wall === "east") panel.position.set(room.width / 2 - 0.055, panel.position.y, opening.offset);
    if (opening.wall === "west") panel.position.set(-room.width / 2 + 0.055, panel.position.y, opening.offset);
    group.add(panel);
    this.dynamicRoot.add(group);
  }

  renderSlope(project) {
    const slope = project.room.features.slope;
    const geometry = new THREE.BufferGeometry();
    const halfWidth = project.room.width / 2;
    const north = project.room.length / 2;
    const inner = north - slope.depth;
    const vertices = new Float32Array([
      -halfWidth, project.room.height, north,
      halfWidth, project.room.height, north,
      halfWidth, slope.startHeight, inner,
      -halfWidth, project.room.height, north,
      halfWidth, slope.startHeight, inner,
      -halfWidth, slope.startHeight, inner,
    ]);
    geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(
      geometry,
      material("#d5cec2", { side: THREE.DoubleSide, transparent: true, opacity: 0.82 }),
    );
    mesh.userData = { type: "slope" };
    this.dynamicRoot.add(mesh);
  }

  renderEnsuite(project) {
    const zone = project.ensuite;
    const centreX = zone.x + zone.width / 2;
    const centreZ = zone.z + zone.depth / 2;
    const group = new THREE.Group();
    group.name = "Proposed en-suite";
    group.userData = { id: "__ensuite__", type: "ensuite" };
    group.position.set(centreX, 0, centreZ);

    const floor = box(zone.width, 0.035, zone.depth, "#d9c88d", {
      transparent: true,
      opacity: 0.48,
      castShadow: false,
    });
    floor.position.y = 0.02;
    floor.userData.selectable = true;
    group.add(floor);

    const wallColour = "#d8c36f";
    const thickness = zone.wallThickness;
    const walls = [
      ["north", 0, zone.height / 2, zone.depth / 2, zone.width, zone.height, thickness],
      ["south", 0, zone.height / 2, -zone.depth / 2, zone.width, zone.height, thickness],
      ["east", zone.width / 2, zone.height / 2, 0, thickness, zone.height, zone.depth],
      ["west", -zone.width / 2, zone.height / 2, 0, thickness, zone.height, zone.depth],
    ];
    walls.forEach(([side, x, y, z, width, height, depth]) => {
      const wall = box(width, height, depth, wallColour, {
        transparent: true,
        opacity: 0.68,
        side: THREE.DoubleSide,
      });
      wall.position.set(x, y, z);
      wall.userData = {
        type: "wall",
        wallId: `ensuite-${side}`,
        side,
        shell: "ensuite",
        baseOpacity: 0.68,
      };
      group.add(wall);
      this.wallMeshes.push(wall);
    });
    this.dynamicRoot.add(group);
    this.objectGroups.set("__ensuite__", group);
  }

  renderServices(project) {
    const markers = [
      ["soil", project.services.soil, "#b5563d"],
      ["water", project.services.water, "#2f83a0"],
      ["extractor", project.services.extractor, "#5f8469"],
    ];
    markers.forEach(([kind, point, colour]) => {
      if (!point.known) return;
      const marker = cylinder(0.09, 0.09, 0.035, colour, { metalness: 0.15 });
      marker.position.set(point.x, 0.03, point.z);
      marker.userData = { type: "service", service: kind };
      this.annotationRoot.add(marker);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.12, 0.16, 32),
        new THREE.MeshBasicMaterial({ color: colour, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(point.x, 0.008, point.z);
      this.annotationRoot.add(ring);
    });
  }

  renderServiceRoutes(project) {
    const colours = { soil: "#b5563d", waste: "#9b6a46", water: "#2f83a0" };
    project.objects.forEach((object) => {
      const product = PRODUCT_BY_FAMILY[object.family];
      if (!product?.service) return;
      const target = product.service === "soil" ? project.services.soil : product.service === "water" ? project.services.water : project.services.soil;
      if (!target.known) return;
      const points = [
        new THREE.Vector3(object.position.x, 0.04, object.position.z),
        new THREE.Vector3(target.x, 0.04, target.z),
      ];
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(
        geometry,
        new THREE.LineDashedMaterial({
          color: colours[product.service],
          dashSize: 0.12,
          gapSize: 0.07,
        }),
      );
      line.computeLineDistances();
      line.userData = { type: "route", objectId: object.id };
      this.routeRoot.add(line);
    });
  }

  updateMeasurements() {
    if (!this.currentProject) return;
    const area = workArea(this.currentProject);
    const remaining =
      this.currentProject.route === "newEnsuite"
        ? `<span>Bedroom left: ${(
            this.currentProject.room.width * this.currentProject.room.length -
            area.width * area.depth
          ).toFixed(1)}m²</span>`
        : "";
    this.measurement.innerHTML = `
      <span>${area.width.toFixed(2)}m × ${area.depth.toFixed(2)}m</span>
      <span>${area.height.toFixed(2)}m high</span>
      ${remaining}
    `;
  }

  pick(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.dynamicRoot.children, true);
    let wallSelection = null;
    for (const hit of hits) {
      let target = hit.object;
      while (target && target !== this.dynamicRoot) {
        if (target.userData?.type === "wall") {
          wallSelection ||= target.userData.wallId;
          break;
        }
        if (target.userData?.id && ["product", "ensuite"].includes(target.userData.type)) {
          this.select(target.userData.id);
          return;
        }
        target = target.parent;
      }
    }
    if (wallSelection) {
      this.callbacks.onWallSelected?.(wallSelection);
      this.select(null);
      return;
    }
    this.select(null);
  }

  select(id, notify = true) {
    this.selectedId = id;
    this.transform.detach();
    if (id && this.objectGroups.has(id)) {
      this.transform.attach(this.objectGroups.get(id));
      this.transform.setMode("translate");
      this.transform.showY = false;
      this.transform.showX = true;
      this.transform.showZ = true;
    }
    if (notify) this.callbacks.onSelect?.(id);
  }

  setTransformMode(mode) {
    if (!this.transform.object) return;
    this.transform.setMode(mode);
    if (mode === "translate") {
      this.transform.showX = true;
      this.transform.showY = false;
      this.transform.showZ = true;
    } else {
      this.transform.showX = false;
      this.transform.showY = true;
      this.transform.showZ = false;
    }
  }

  snapProduct(group, object) {
    const definition = PRODUCT_BY_FAMILY[object.family];
    if (!definition?.wallSnap || !this.currentProject) return;
    const area = workArea(this.currentProject);
    const angle = group.rotation.y;
    const width = object.dimensions.width / 1000;
    const depth = object.dimensions.depth / 1000;
    const halfX = (Math.abs(Math.cos(angle)) * width + Math.abs(Math.sin(angle)) * depth) / 2;
    const halfZ = (Math.abs(Math.sin(angle)) * width + Math.abs(Math.cos(angle)) * depth) / 2;
    const candidates = [
      { distance: Math.abs(group.position.z - (area.minZ + halfZ)), side: "south" },
      { distance: Math.abs(group.position.z - (area.maxZ - halfZ)), side: "north" },
      { distance: Math.abs(group.position.x - (area.minX + halfX)), side: "west" },
      { distance: Math.abs(group.position.x - (area.maxX - halfX)), side: "east" },
    ].sort((a, b) => a.distance - b.distance);
    if (candidates[0].distance > 0.16) return;
    const side = candidates[0].side;
    if (side === "south") group.position.z = area.minZ + halfZ;
    if (side === "north") group.position.z = area.maxZ - halfZ;
    if (side === "west") group.position.x = area.minX + halfX;
    if (side === "east") group.position.x = area.maxX - halfX;
  }

  handleObjectTransform(commit) {
    const group = this.transform.object;
    if (!group || !this.currentProject) return;
    if (this.selectedId === "__ensuite__") {
      const zone = this.currentProject.ensuite;
      const next = {
        x: group.position.x - zone.width / 2,
        z: group.position.z - zone.depth / 2,
      };
      this.callbacks.onTransform?.({
        id: "__ensuite__",
        type: "ensuite",
        position: next,
        commit,
      });
      this.syncObjectTransforms();
      this.updateMeasurements();
      return;
    }

    const object = this.currentProject.objects.find((item) => item.id === this.selectedId);
    if (!object) return;
    this.snapProduct(group, object);
    group.position.y = object.position.y || 0;
    this.callbacks.onTransform?.({
      id: object.id,
      type: "product",
      position: {
        x: group.position.x,
        y: group.position.y,
        z: group.position.z,
      },
      rotation: THREE.MathUtils.radToDeg(group.rotation.y),
      commit,
    });
    this.rebuildRoutes();
  }

  syncObjectTransforms() {
    if (!this.currentProject) return;
    this.currentProject.objects.forEach((object) => {
      const group = this.objectGroups.get(object.id);
      if (!group) return;
      group.position.set(object.position.x, object.position.y || 0, object.position.z);
      group.rotation.y = THREE.MathUtils.degToRad(object.rotation || 0);
    });
  }

  rebuildRoutes() {
    this.clearRoot(this.routeRoot);
    if (this.currentProject) this.renderServiceRoutes(this.currentProject);
  }

  updateWarnings(warnings) {
    const warningIds = new Set(warnings.flatMap((warning) => warning.ids));
    this.objectGroups.forEach((group, id) => {
      if (id === "__ensuite__") return;
      group.traverse((child) => {
        const materials = child.material
          ? Array.isArray(child.material)
            ? child.material
            : [child.material]
          : [];
        materials.forEach((entry) => {
          if (!entry.emissive) return;
          entry.emissive.set(warningIds.has(id) ? "#6c140d" : "#000000");
          entry.emissiveIntensity = warningIds.has(id) ? 0.42 : 0;
        });
      });
    });
  }

  screenToFloor(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const target = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(plane, target)
      ? { x: target.x, y: 0, z: target.z }
      : { x: 0, y: 0, z: 0 };
  }

  setView(view) {
    if (!this.currentProject) return;
    const area = workArea(this.currentProject);
    const centre = {
      x: (area.minX + area.maxX) / 2,
      z: (area.minZ + area.maxZ) / 2,
    };
    const span = Math.max(this.currentProject.room.width, this.currentProject.room.length);
    this.walkMode = view === "walk";
    if (view === "overhead") {
      this.camera.position.set(centre.x, Math.max(5, span * 1.8), centre.z + 0.001);
      this.controls.target.set(centre.x, 0, centre.z);
    } else if (view === "north") {
      this.camera.position.set(centre.x, 1.45, area.minZ - span * 1.15);
      this.controls.target.set(centre.x, 1.1, centre.z);
    } else if (view === "east") {
      this.camera.position.set(area.minX - span * 1.15, 1.45, centre.z);
      this.controls.target.set(centre.x, 1.1, centre.z);
    } else if (view === "walk") {
      this.camera.position.set(centre.x, 1.58, area.minZ + 0.35);
      this.controls.target.set(centre.x, 1.55, centre.z);
      this.container.classList.add("is-walk-view");
      this.renderer.domElement.focus();
    } else {
      this.camera.position.set(centre.x + span * 1.35, span * 0.95, centre.z + span * 1.45);
      this.controls.target.set(centre.x, 0.7, centre.z);
    }
    if (view !== "walk") this.container.classList.remove("is-walk-view");
    this.controls.enableRotate = view !== "overhead";
    this.controls.maxPolarAngle = view === "walk" ? Math.PI * 0.52 : Math.PI * 0.49;
    this.controls.update();
  }

  moveWalk(direction) {
    if (!this.currentProject) return;
    const step = 0.16;
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, this.camera.up).normalize();
    const delta =
      direction === "forward"
        ? forward.multiplyScalar(step)
        : direction === "back"
          ? forward.multiplyScalar(-step)
          : direction === "right"
            ? right.multiplyScalar(-step)
            : right.multiplyScalar(step);
    const area =
      this.currentProject.route === "newEnsuite"
        ? {
            minX: -this.currentProject.room.width / 2,
            maxX: this.currentProject.room.width / 2,
            minZ: -this.currentProject.room.length / 2,
            maxZ: this.currentProject.room.length / 2,
          }
        : workArea(this.currentProject);
    this.camera.position.x = THREE.MathUtils.clamp(
      this.camera.position.x + delta.x,
      area.minX + 0.15,
      area.maxX - 0.15,
    );
    this.camera.position.z = THREE.MathUtils.clamp(
      this.camera.position.z + delta.z,
      area.minZ + 0.15,
      area.maxZ - 0.15,
    );
    this.controls.target.add(delta);
    this.controls.update();
  }

  setAutoFadeWalls(enabled) {
    this.autoFadeWalls = enabled;
    if (!enabled) {
      this.wallMeshes.forEach((wall) => {
        wall.material.opacity = wall.userData.baseOpacity;
      });
    }
  }

  fadeWalls() {
    if (!this.autoFadeWalls || !this.currentProject) return;
    const area = workArea(this.currentProject);
    const centreX = (area.minX + area.maxX) / 2;
    const centreZ = (area.minZ + area.maxZ) / 2;
    const dx = this.camera.position.x - centreX;
    const dz = this.camera.position.z - centreZ;
    const cameraFacingSides = new Set([
      dx > 0 ? "east" : "west",
      dz > 0 ? "north" : "south",
    ]);
    this.wallMeshes.forEach((wall) => {
      const fade = cameraFacingSides.has(wall.userData.side);
      wall.material.opacity = fade ? 0.1 : wall.userData.baseOpacity;
    });
  }

  animate() {
    this.controls.update();
    this.fadeWalls();
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this.resizeObserver?.disconnect();
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
    this.container.replaceChildren();
  }
}
