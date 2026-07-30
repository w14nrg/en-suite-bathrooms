import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { PRODUCT_BY_FAMILY } from "../data/estimator-products.mjs";
import { makeObject, objectBounds } from "./estimator-core.mjs";

const STORAGE_KEY = "ensuites-room-planner-v2";
const SNAP = 0.05;
const ROOM_LIMITS = {
  width: [1, 8],
  length: [1, 10],
  height: [1.8, 4],
};

const PALETTE = [
  { family: "close-coupled-toilet", icon: "fa-toilet", short: "Toilet" },
  { family: "wall-hung-toilet", icon: "fa-toilet", short: "Wall-hung WC" },
  { family: "vanity-unit", icon: "fa-sink", short: "Vanity" },
  { family: "wall-mounted-basin", icon: "fa-sink", short: "Basin" },
  { family: "square-enclosure", icon: "fa-shower", short: "Shower" },
  { family: "quadrant-enclosure", icon: "fa-shower", short: "Quadrant" },
  { family: "bath", icon: "fa-bath", short: "Bath" },
  { family: "heated-towel-rail", icon: "fa-temperature-three-quarters", short: "Towel rail" },
  { family: "door", icon: "fa-door-open", short: "Door" },
  { family: "window", icon: "fa-border-all", short: "Window" },
  { family: "fixed-obstruction", icon: "fa-cube", short: "Obstruction" },
];

const dom = {
  width: document.querySelector("#roomWidth"),
  length: document.querySelector("#roomLength"),
  height: document.querySelector("#roomHeight"),
  palette: document.querySelector("#fixturePalette"),
  planSvg: document.querySelector("#planSvg"),
  planSurface: document.querySelector("#planSurface"),
  threeSurface: document.querySelector("#threeSurface"),
  selection: document.querySelector("#selectionPanel"),
  warning: document.querySelector("#plannerWarning"),
  roomSummary: document.querySelector("#roomSummary"),
  saveStatus: document.querySelector("#saveStatus"),
  emptyHint: document.querySelector("#emptyHint"),
  clear: document.querySelector("#clearFixtures"),
  reset: document.querySelector("#resetPlanner"),
  undo: document.querySelector("#undoAction"),
  redo: document.querySelector("#redoAction"),
  centre3d: document.querySelector("#centre3d"),
};

function freshState() {
  return {
    version: 2,
    room: { width: 2.1, length: 2.45, height: 2.4 },
    objects: [],
    selectedId: null,
    view: "2d",
    updatedAt: new Date().toISOString(),
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function snap(value, step = SNAP) {
  return Math.round(value / step) * step;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatMetres(value) {
  return `${number(value).toFixed(2)}m`;
}

function sanitiseState(candidate) {
  if (!candidate || candidate.version !== 2 || !candidate.room || !Array.isArray(candidate.objects)) {
    return freshState();
  }
  const next = freshState();
  next.room.width = clamp(number(candidate.room.width, next.room.width), ...ROOM_LIMITS.width);
  next.room.length = clamp(number(candidate.room.length, next.room.length), ...ROOM_LIMITS.length);
  next.room.height = clamp(number(candidate.room.height, next.room.height), ...ROOM_LIMITS.height);
  next.objects = candidate.objects.filter((object) => PRODUCT_BY_FAMILY[object.family]);
  next.selectedId = next.objects.some((object) => object.id === candidate.selectedId)
    ? candidate.selectedId
    : null;
  next.view = candidate.view === "3d" ? "3d" : "2d";
  next.updatedAt = candidate.updatedAt || next.updatedAt;
  next.objects.forEach((object) => clampObjectToRoom(object, next.room));
  return next;
}

function loadState() {
  try {
    return sanitiseState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    return freshState();
  }
}

let state = loadState();
let history = [];
let future = [];
let saveTimer = null;
let activePointer = null;
let three = null;

function save() {
  dom.saveStatus.textContent = "Saving…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    state.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    dom.saveStatus.textContent = "Saved on this device";
  }, 180);
}

function remember() {
  history.push(clone(state));
  if (history.length > 50) history.shift();
  future = [];
}

function commit(mutator) {
  remember();
  mutator();
  renderAll();
}

function footprint(object) {
  const angle = ((object.rotation || 0) * Math.PI) / 180;
  const width = object.dimensions.width / 1000;
  const depth = object.dimensions.depth / 1000;
  return {
    width: Math.abs(Math.cos(angle)) * width + Math.abs(Math.sin(angle)) * depth,
    depth: Math.abs(Math.sin(angle)) * width + Math.abs(Math.cos(angle)) * depth,
  };
}

function clampObjectToRoom(object, room = state.room) {
  const size = footprint(object);
  const halfWidth = Math.max(0, room.width / 2 - size.width / 2);
  const halfLength = Math.max(0, room.length / 2 - size.depth / 2);
  object.position.x = snap(clamp(number(object.position.x), -halfWidth, halfWidth));
  object.position.z = snap(clamp(number(object.position.z), -halfLength, halfLength));
  object.position.y = number(object.position.y);
}

function getSelected() {
  return state.objects.find((object) => object.id === state.selectedId) || null;
}

function chooseOpenSpot(object) {
  const candidates = [
    [0, 0],
    [-state.room.width * 0.25, -state.room.length * 0.25],
    [state.room.width * 0.25, -state.room.length * 0.25],
    [-state.room.width * 0.25, state.room.length * 0.25],
    [state.room.width * 0.25, state.room.length * 0.25],
  ];
  const chosen = candidates[Math.min(state.objects.length, candidates.length - 1)];
  object.position.x = chosen[0];
  object.position.z = chosen[1];
  clampObjectToRoom(object);
}

function addFixture(family) {
  commit(() => {
    const object = makeObject(family);
    chooseOpenSpot(object);
    state.objects.push(object);
    state.selectedId = object.id;
  });
}

function removeSelected() {
  if (!state.selectedId) return;
  commit(() => {
    state.objects = state.objects.filter((object) => object.id !== state.selectedId);
    state.selectedId = null;
  });
}

function rotateSelected() {
  const object = getSelected();
  if (!object) return;
  commit(() => {
    object.rotation = ((object.rotation || 0) + 90) % 360;
    clampObjectToRoom(object);
  });
}

function duplicateSelected() {
  const object = getSelected();
  if (!object) return;
  commit(() => {
    const copy = makeObject(object.family, {
      x: object.position.x + 0.15,
      z: object.position.z + 0.15,
      rotation: object.rotation,
    });
    copy.dimensions = clone(object.dimensions);
    copy.colour = object.colour;
    clampObjectToRoom(copy);
    state.objects.push(copy);
    state.selectedId = copy.id;
  });
}

function updateRoom(key, value) {
  const [min, max] = ROOM_LIMITS[key];
  commit(() => {
    state.room[key] = snap(clamp(number(value, state.room[key]), min, max), 0.01);
    state.objects.forEach((object) => clampObjectToRoom(object));
  });
}

function renderPalette() {
  dom.palette.innerHTML = PALETTE.map((item) => {
    const product = PRODUCT_BY_FAMILY[item.family];
    return `
      <button type="button" class="fixture-button" data-family="${item.family}" title="Add ${product.label}">
        <i class="fa-solid ${item.icon}" aria-hidden="true"></i>
        <span>${item.short}</span>
      </button>
    `;
  }).join("");
}

function planMetrics() {
  const canvas = { width: 1000, height: 700, marginX: 125, marginY: 105 };
  const usableWidth = canvas.width - canvas.marginX * 2;
  const usableHeight = canvas.height - canvas.marginY * 2;
  const scale = Math.min(usableWidth / state.room.width, usableHeight / state.room.length);
  return {
    ...canvas,
    scale,
    roomWidth: state.room.width * scale,
    roomHeight: state.room.length * scale,
    centreX: canvas.width / 2,
    centreY: canvas.height / 2,
  };
}

function worldToPlan(x, z, metrics = planMetrics()) {
  return {
    x: metrics.centreX + x * metrics.scale,
    y: metrics.centreY - z * metrics.scale,
  };
}

function planToWorld(x, y, metrics = planMetrics()) {
  return {
    x: (x - metrics.centreX) / metrics.scale,
    z: (metrics.centreY - y) / metrics.scale,
  };
}

function gridLines(metrics) {
  const step = state.room.width > 5 || state.room.length > 5 ? 0.5 : 0.25;
  const lines = [];
  const left = metrics.centreX - metrics.roomWidth / 2;
  const right = metrics.centreX + metrics.roomWidth / 2;
  const top = metrics.centreY - metrics.roomHeight / 2;
  const bottom = metrics.centreY + metrics.roomHeight / 2;
  for (let x = -state.room.width / 2 + step; x < state.room.width / 2; x += step) {
    const point = worldToPlan(x, 0, metrics);
    lines.push(`<line x1="${point.x}" y1="${top}" x2="${point.x}" y2="${bottom}" />`);
  }
  for (let z = -state.room.length / 2 + step; z < state.room.length / 2; z += step) {
    const point = worldToPlan(0, z, metrics);
    lines.push(`<line x1="${left}" y1="${point.y}" x2="${right}" y2="${point.y}" />`);
  }
  return lines.join("");
}

function fixtureShape(object, metrics) {
  const size = footprint(object);
  const position = worldToPlan(object.position.x, object.position.z, metrics);
  const width = Math.max(16, size.width * metrics.scale);
  const height = Math.max(16, size.depth * metrics.scale);
  const selected = object.id === state.selectedId;
  const product = PRODUCT_BY_FAMILY[object.family];
  const className = selected ? "plan-fixture is-selected" : "plan-fixture";
  const label = product?.label || object.label;
  let shape = `<rect x="${-width / 2}" y="${-height / 2}" width="${width}" height="${height}" rx="10" />`;

  if (product?.modelKind?.startsWith("toilet")) {
    shape = `<ellipse cx="0" cy="${height * 0.08}" rx="${width * 0.38}" ry="${height * 0.38}"/><rect x="${-width * 0.42}" y="${-height * 0.48}" width="${width * 0.84}" height="${height * 0.28}" rx="5"/>`;
  } else if (product?.modelKind === "bath") {
    shape = `<rect x="${-width / 2}" y="${-height / 2}" width="${width}" height="${height}" rx="${Math.min(width, height) * 0.18}"/><rect class="plan-fixture-inner" x="${-width * 0.38}" y="${-height * 0.3}" width="${width * 0.76}" height="${height * 0.6}" rx="${Math.min(width, height) * 0.14}"/>`;
  } else if (product?.modelKind?.includes("enclosure") || product?.modelKind === "tray") {
    shape = `<rect x="${-width / 2}" y="${-height / 2}" width="${width}" height="${height}" rx="4"/><path class="plan-fixture-inner" d="M ${-width / 2} ${-height / 2} L ${width / 2} ${height / 2} M ${width / 2} ${-height / 2} L ${-width / 2} ${height / 2}"/>`;
  } else if (product?.modelKind === "door") {
    shape = `<path d="M ${-width / 2} ${height / 2} L ${-width / 2} ${-height / 2} L ${width / 2} ${-height / 2}"/><path class="plan-fixture-inner" d="M ${-width / 2} ${height / 2} A ${width} ${width} 0 0 1 ${width / 2} ${-height / 2}"/>`;
  }

  return `
    <g class="${className}" data-object-id="${object.id}" transform="translate(${position.x} ${position.y}) rotate(${-object.rotation})" role="button" aria-label="${label}">
      ${shape}
      <text x="0" y="${height / 2 + 20}" transform="rotate(${object.rotation})">${label}</text>
    </g>
  `;
}

function renderPlan() {
  const metrics = planMetrics();
  const left = metrics.centreX - metrics.roomWidth / 2;
  const right = metrics.centreX + metrics.roomWidth / 2;
  const top = metrics.centreY - metrics.roomHeight / 2;
  const bottom = metrics.centreY + metrics.roomHeight / 2;
  dom.planSvg.innerHTML = `
    <defs>
      <filter id="selectedGlow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="0" stdDeviation="5" flood-opacity="0.26"/>
      </filter>
    </defs>
    <rect class="plan-room" x="${left}" y="${top}" width="${metrics.roomWidth}" height="${metrics.roomHeight}" rx="3" />
    <g class="plan-grid">${gridLines(metrics)}</g>
    <line class="dimension-line" x1="${left}" y1="${top - 42}" x2="${right}" y2="${top - 42}" />
    <line class="dimension-tick" x1="${left}" y1="${top - 52}" x2="${left}" y2="${top - 32}" />
    <line class="dimension-tick" x1="${right}" y1="${top - 52}" x2="${right}" y2="${top - 32}" />
    <text class="dimension-text" x="${metrics.centreX}" y="${top - 55}">${formatMetres(state.room.width)}</text>
    <line class="dimension-line" x1="${right + 42}" y1="${top}" x2="${right + 42}" y2="${bottom}" />
    <line class="dimension-tick" x1="${right + 32}" y1="${top}" x2="${right + 52}" y2="${top}" />
    <line class="dimension-tick" x1="${right + 32}" y1="${bottom}" x2="${right + 52}" y2="${bottom}" />
    <text class="dimension-text side" x="${right + 68}" y="${metrics.centreY}" transform="rotate(90 ${right + 68} ${metrics.centreY})">${formatMetres(state.room.length)}</text>
    <g class="fixture-layer">${state.objects.map((object) => fixtureShape(object, metrics)).join("")}</g>
    <g class="resize-layer" aria-label="Room resize handles">
      <circle class="resize-handle" data-resize="width" cx="${right}" cy="${metrics.centreY}" r="13" />
      <circle class="resize-handle" data-resize="length" cx="${metrics.centreX}" cy="${bottom}" r="13" />
      <rect class="resize-handle corner" data-resize="both" x="${right - 12}" y="${bottom - 12}" width="24" height="24" rx="6" />
    </g>
  `;
  dom.emptyHint.hidden = state.objects.length > 0;
}

function findWarnings() {
  const warnings = [];
  for (let index = 0; index < state.objects.length; index += 1) {
    const first = state.objects[index];
    const a = objectBounds(first);
    for (let other = index + 1; other < state.objects.length; other += 1) {
      const second = state.objects[other];
      const b = objectBounds(second);
      const overlap = !(
        a.maxX <= b.minX + 0.02 ||
        a.minX >= b.maxX - 0.02 ||
        a.maxZ <= b.minZ + 0.02 ||
        a.minZ >= b.maxZ - 0.02
      );
      if (overlap) warnings.push(`${first.label} overlaps ${second.label}`);
    }
  }
  return warnings;
}

function renderSelection() {
  const object = getSelected();
  if (!object) {
    dom.selection.innerHTML = `
      <div class="selection-empty">
        <i class="fa-regular fa-hand-pointer" aria-hidden="true"></i>
        <div><strong>Select an item to move it</strong><span>Drag it directly. Use empty space to move around the 3D room.</span></div>
      </div>
    `;
    return;
  }
  const dimensions = object.dimensions;
  dom.selection.innerHTML = `
    <div class="selection-heading">
      <div>
        <small>Selected</small>
        <strong>${object.label}</strong>
        <span>${dimensions.width} × ${dimensions.depth}mm</span>
      </div>
      <button type="button" class="icon-button danger" data-selection-action="delete" aria-label="Delete selected item"><i class="fa-solid fa-trash"></i></button>
    </div>
    <div class="selection-actions">
      <button type="button" data-selection-action="rotate"><i class="fa-solid fa-rotate-right"></i> Rotate 90°</button>
      <button type="button" data-selection-action="duplicate"><i class="fa-regular fa-copy"></i> Duplicate</button>
    </div>
  `;
}

function renderStatus() {
  const warnings = findWarnings();
  dom.warning.hidden = warnings.length === 0;
  dom.warning.innerHTML = warnings.length
    ? `<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><span>${warnings[0]}${warnings.length > 1 ? ` and ${warnings.length - 1} more` : ""}. Drag items apart.</span>`
    : "";
  dom.roomSummary.textContent = `${formatMetres(state.room.width)} × ${formatMetres(state.room.length)} · ${formatMetres(state.room.height)} high · ${state.objects.length} item${state.objects.length === 1 ? "" : "s"}`;
  dom.undo.disabled = history.length === 0;
  dom.redo.disabled = future.length === 0;
  dom.clear.disabled = state.objects.length === 0;
}

function renderInputs() {
  dom.width.value = state.room.width.toFixed(2);
  dom.length.value = state.room.length.toFixed(2);
  dom.height.value = state.room.height.toFixed(2);
}

function setView(view, { saveView = true } = {}) {
  state.view = view;
  document.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  dom.planSurface.hidden = view !== "2d";
  dom.threeSurface.hidden = view !== "3d";
  dom.centre3d.hidden = view !== "3d";
  if (view === "3d") {
    three ||= new SimpleRoom3D(dom.threeSurface, {
      onSelect(id) {
        state.selectedId = id;
        renderPlan();
        renderSelection();
        save();
      },
      onDragStart(id) {
        remember();
        state.selectedId = id;
      },
      onDrag(object) {
        clampObjectToRoom(object);
        renderPlan();
        renderSelection();
        renderStatus();
      },
      onDragEnd() {
        renderAll();
      },
    });
    three.render(state);
    requestAnimationFrame(() => three.resize());
  }
  if (saveView) save();
}

function renderAll() {
  renderInputs();
  renderPlan();
  renderSelection();
  renderStatus();
  if (three) three.render(state);
  setView(state.view, { saveView: false });
  save();
}

function pointInSvg(event) {
  const point = dom.planSvg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(dom.planSvg.getScreenCTM().inverse());
}

function startPlanPointer(event) {
  const fixture = event.target.closest("[data-object-id]");
  const resize = event.target.closest("[data-resize]");
  if (!fixture && !resize) {
    state.selectedId = null;
    renderPlan();
    renderSelection();
    three?.setSelection(null);
    save();
    return;
  }
  event.preventDefault();
  dom.planSvg.setPointerCapture(event.pointerId);
  remember();
  const metrics = planMetrics();
  const point = pointInSvg(event);
  if (fixture) {
    const id = fixture.dataset.objectId;
    const object = state.objects.find((item) => item.id === id);
    if (!object) return;
    state.selectedId = id;
    const world = planToWorld(point.x, point.y, metrics);
    activePointer = {
      type: "fixture",
      pointerId: event.pointerId,
      id,
      offsetX: object.position.x - world.x,
      offsetZ: object.position.z - world.z,
    };
  } else {
    activePointer = {
      type: "resize",
      pointerId: event.pointerId,
      mode: resize.dataset.resize,
      point,
      room: clone(state.room),
      scale: metrics.scale,
    };
  }
  renderPlan();
  renderSelection();
}

function movePlanPointer(event) {
  if (!activePointer || activePointer.pointerId !== event.pointerId) return;
  event.preventDefault();
  const point = pointInSvg(event);
  if (activePointer.type === "fixture") {
    const object = state.objects.find((item) => item.id === activePointer.id);
    if (!object) return;
    const world = planToWorld(point.x, point.y);
    object.position.x = snap(world.x + activePointer.offsetX);
    object.position.z = snap(world.z + activePointer.offsetZ);
    clampObjectToRoom(object);
    renderPlan();
    renderSelection();
    renderStatus();
    three?.moveObject(object);
    return;
  }
  const dx = (point.x - activePointer.point.x) / activePointer.scale;
  const dy = (point.y - activePointer.point.y) / activePointer.scale;
  if (activePointer.mode === "width" || activePointer.mode === "both") {
    state.room.width = snap(clamp(activePointer.room.width + dx * 2, ...ROOM_LIMITS.width), 0.05);
  }
  if (activePointer.mode === "length" || activePointer.mode === "both") {
    state.room.length = snap(clamp(activePointer.room.length + dy * 2, ...ROOM_LIMITS.length), 0.05);
  }
  state.objects.forEach((object) => clampObjectToRoom(object));
  renderInputs();
  renderPlan();
  renderStatus();
  three?.render(state);
}

function endPlanPointer(event) {
  if (!activePointer || activePointer.pointerId !== event.pointerId) return;
  activePointer = null;
  try {
    dom.planSvg.releasePointerCapture(event.pointerId);
  } catch {
    // Pointer capture may already have been released by the browser.
  }
  renderAll();
}

function undo() {
  if (!history.length) return;
  future.push(clone(state));
  state = sanitiseState(history.pop());
  renderAll();
}

function redo() {
  if (!future.length) return;
  history.push(clone(state));
  state = sanitiseState(future.pop());
  renderAll();
}

function bindEvents() {
  dom.palette.addEventListener("click", (event) => {
    const button = event.target.closest("[data-family]");
    if (button) addFixture(button.dataset.family);
  });

  for (const [element, key] of [
    [dom.width, "width"],
    [dom.length, "length"],
    [dom.height, "height"],
  ]) {
    element.addEventListener("change", () => updateRoom(key, element.value));
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        element.blur();
      }
    });
  }

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  dom.selection.addEventListener("click", (event) => {
    const button = event.target.closest("[data-selection-action]");
    if (!button) return;
    if (button.dataset.selectionAction === "rotate") rotateSelected();
    if (button.dataset.selectionAction === "duplicate") duplicateSelected();
    if (button.dataset.selectionAction === "delete") removeSelected();
  });

  dom.planSvg.addEventListener("pointerdown", startPlanPointer);
  dom.planSvg.addEventListener("pointermove", movePlanPointer);
  dom.planSvg.addEventListener("pointerup", endPlanPointer);
  dom.planSvg.addEventListener("pointercancel", endPlanPointer);

  dom.clear.addEventListener("click", () => {
    if (!state.objects.length) return;
    commit(() => {
      state.objects = [];
      state.selectedId = null;
    });
  });

  dom.reset.addEventListener("click", () => {
    remember();
    state = freshState();
    renderAll();
  });

  dom.undo.addEventListener("click", undo);
  dom.redo.addEventListener("click", redo);
  dom.centre3d.addEventListener("click", () => three?.fitCamera());

  window.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      event.shiftKey ? redo() : undo();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
    }
    if ((event.key === "Delete" || event.key === "Backspace") && document.activeElement?.tagName !== "INPUT") {
      removeSelected();
    }
  });
}

function threeMaterial(colour, options = {}) {
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

function threeBox(width, height, depth, colour, options = {}) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    threeMaterial(colour, options),
  );
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  return mesh;
}

function addMesh(group, mesh, x, y, z) {
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
    const bowl = new THREE.Mesh(
      new THREE.CylinderGeometry(width * 0.34, width * 0.42, Math.min(0.42, height * 0.55), 28),
      threeMaterial(white),
    );
    addMesh(group, bowl, 0, Math.min(0.42, height * 0.55) / 2, depth * 0.08);
    if (product.modelKind === "toilet-coupled") {
      addMesh(group, threeBox(width * 0.92, height * 0.48, depth * 0.32, white), 0, height * 0.7, -depth * 0.3);
    }
  } else if (product?.modelKind === "vanity") {
    addMesh(group, threeBox(width, height * 0.82, depth, object.colour || "#8d765c"), 0, height * 0.41, 0);
    addMesh(group, threeBox(width * 1.02, height * 0.16, depth * 1.03, white), 0, height * 0.9, 0);
  } else if (product?.modelKind === "basin-wall" || product?.modelKind === "basin-free") {
    addMesh(group, threeBox(width, Math.max(0.16, height * 0.2), depth, white), 0, Math.max(0.78, height * 0.75), 0);
  } else if (product?.modelKind?.includes("enclosure")) {
    addMesh(group, threeBox(width, 0.065, depth, white), 0, 0.032, 0);
    addMesh(group, threeBox(width, height, 0.016, glass, { transparent: true, opacity: 0.26, depthWrite: false }), 0, height / 2, -depth / 2);
    addMesh(group, threeBox(0.016, height, depth, glass, { transparent: true, opacity: 0.26, depthWrite: false }), -width / 2, height / 2, 0);
  } else if (product?.modelKind === "bath") {
    addMesh(group, threeBox(width, height, depth, white), 0, height / 2, 0);
    addMesh(group, threeBox(width * 0.82, 0.07, depth * 0.64, "#c7e1e5"), 0, height * 0.94, 0);
  } else if (product?.modelKind === "towel-rail") {
    for (let y = 0.15; y < height; y += 0.12) {
      addMesh(group, threeBox(width, 0.018, Math.max(depth, 0.035), chrome, { metalness: 0.65 }), 0, y, 0);
    }
    addMesh(group, threeBox(0.025, height, depth, chrome, { metalness: 0.65 }), -width / 2, height / 2, 0);
    addMesh(group, threeBox(0.025, height, depth, chrome, { metalness: 0.65 }), width / 2, height / 2, 0);
  } else if (product?.modelKind === "door") {
    addMesh(group, threeBox(width, height, Math.max(depth, 0.045), object.colour || "#9c7449"), 0, height / 2, 0);
  } else if (product?.modelKind === "window") {
    addMesh(group, threeBox(width, height, Math.max(depth, 0.05), glass, { transparent: true, opacity: 0.5, depthWrite: false }), 0, 1.25, 0);
  } else {
    addMesh(group, threeBox(width, Math.max(height, 0.12), depth, object.colour || "#8d8275"), 0, Math.max(height, 0.12) / 2, 0);
  }

  const hitbox = threeBox(width, Math.max(height, 0.18), depth, "#ffffff", {
    transparent: true,
    opacity: 0.001,
    castShadow: false,
    receiveShadow: false,
    depthWrite: false,
  });
  hitbox.position.y = Math.max(height, 0.18) / 2;
  hitbox.userData = { id: object.id, selectable: true };
  group.add(hitbox);
  group.position.set(object.position.x, object.position.y || 0, object.position.z);
  group.rotation.y = THREE.MathUtils.degToRad(object.rotation || 0);
  return group;
}

class SimpleRoom3D {
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
      this.drag = {
        pointerId: event.pointerId,
        id,
        offsetX: object.position.x - point.x,
        offsetZ: object.position.z - point.z,
      };
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
      clampObjectToRoom(object, this.state.room);
      this.moveObject(object);
      this.callbacks.onDrag?.(object);
    });

    const end = (event) => {
      if (!this.drag || this.drag.pointerId !== event.pointerId) return;
      this.drag = null;
      this.controls.enabled = true;
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture may already be released.
      }
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
    this.selectionBox?.dispose?.();
    this.selectionBox = null;
    while (this.root.children.length) {
      const child = this.root.children.pop();
      child.traverse((node) => {
        node.geometry?.dispose?.();
        if (node.material) {
          const materials = Array.isArray(node.material) ? node.material : [node.material];
          materials.forEach((material) => material.dispose?.());
        }
      });
    }
    this.objectGroups.clear();
  }

  render(nextState) {
    this.state = nextState;
    this.selectedId = nextState.selectedId;
    this.clear();
    const { width, length, height } = nextState.room;
    const floor = threeBox(width, 0.06, length, "#c9bba8", { castShadow: false });
    floor.position.y = -0.03;
    this.root.add(floor);
    const grid = new THREE.GridHelper(Math.max(width, length), Math.max(4, Math.ceil(Math.max(width, length) * 4)), "#9e8240", "#d8d0c5");
    grid.position.y = 0.005;
    grid.material.opacity = 0.28;
    grid.material.transparent = true;
    this.root.add(grid);

    const wallMaterial = { transparent: true, opacity: 0.58, side: THREE.DoubleSide, castShadow: false };
    const north = threeBox(width, height, 0.07, "#ded8ce", wallMaterial);
    north.position.set(0, height / 2, length / 2);
    this.root.add(north);
    const west = threeBox(0.07, height, length, "#ded8ce", wallMaterial);
    west.position.set(-width / 2, height / 2, 0);
    this.root.add(west);
    const east = threeBox(0.07, height, length, "#ded8ce", { ...wallMaterial, opacity: 0.24 });
    east.position.set(width / 2, height / 2, 0);
    this.root.add(east);

    nextState.objects.forEach((object) => {
      const group = fixture3D(object);
      this.root.add(group);
      this.objectGroups.set(object.id, group);
    });
    this.setSelection(this.selectedId);
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
    const room = this.state?.room || state.room;
    const span = Math.max(room.width, room.length);
    this.camera.position.set(span * 1.15, Math.max(2.6, span * 0.95), span * 1.25);
    this.controls.target.set(0, Math.min(0.8, room.height * 0.35), 0);
    this.controls.update();
  }
}

renderPalette();
bindEvents();
renderAll();
