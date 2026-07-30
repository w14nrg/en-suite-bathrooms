import { PRODUCT_BY_FAMILY } from "../data/estimator-products.mjs";
import { classifyProductLink, parseDimensionsFromText } from "./estimator-core.mjs";
import { createPartitionWall } from "./estimator-draft3-core.mjs";
import {
  clamp,
  clampObjectToArea,
  clampPointToRoom,
  clampServiceToRoom,
  clampWallToRoom,
  clampZone,
  number,
  planMetrics,
  planToWorld,
  resizeZoneFromHandle,
  snap,
  svgPoint,
} from "./estimator-draft3-plan.mjs";
import { SimpleRoom3D } from "./estimator-draft2-3d.mjs";
import { createPlannerStore } from "./estimator-draft3-store.mjs";
import {
  createPlannerRenderer,
  renderStaticControls,
} from "./estimator-draft3-render.mjs";

const dom = {
  routeChoices: document.querySelector("#routeChoices"),
  roomCardTitle: document.querySelector("#roomCardTitle"),
  roomCardHelp: document.querySelector("#roomCardHelp"),
  width: document.querySelector("#roomWidth"),
  length: document.querySelector("#roomLength"),
  height: document.querySelector("#roomHeight"),
  ensuiteControls: document.querySelector("#ensuiteControls"),
  zoneWidth: document.querySelector("#zoneWidth"),
  zoneDepth: document.querySelector("#zoneDepth"),
  drawWall: document.querySelector("#drawWall"),
  cancelDraw: document.querySelector("#cancelDraw"),
  clearWalls: document.querySelector("#clearWalls"),
  drawWallHint: document.querySelector("#drawWallHint"),
  serviceDrawHint: document.querySelector("#serviceDrawHint"),
  serviceList: document.querySelector("#serviceList"),
  palette: document.querySelector("#fixturePalette"),
  selection: document.querySelector("#selectionPanel"),
  planSvg: document.querySelector("#planSvg"),
  planSurface: document.querySelector("#planSurface"),
  threeSurface: document.querySelector("#threeSurface"),
  emptyHint: document.querySelector("#emptyHint"),
  warning: document.querySelector("#plannerWarning"),
  roomSummary: document.querySelector("#roomSummary"),
  saveStatus: document.querySelector("#saveStatus"),
  clearFixtures: document.querySelector("#clearFixtures"),
  reset: document.querySelector("#resetPlanner"),
  undo: document.querySelector("#undoAction"),
  redo: document.querySelector("#redoAction"),
  centre3d: document.querySelector("#centre3d"),
  productUrl: document.querySelector("#productUrl"),
  productFamily: document.querySelector("#productFamily"),
  productPrice: document.querySelector("#productPrice"),
  addProductLink: document.querySelector("#addProductLink"),
  productLinkFeedback: document.querySelector("#productLinkFeedback"),
  photoInput: document.querySelector("#currentBathroomPhoto"),
  photoPreview: document.querySelector("#photoPreview"),
  photoImage: document.querySelector("#photoImage"),
  photoStatus: document.querySelector("#photoStatus"),
  removePhoto: document.querySelector("#removePhoto"),
  estimateToggle: document.querySelector("#estimateToggle"),
  estimateBreakdown: document.querySelector("#estimateBreakdown"),
  estimateTotal: document.querySelector("#estimateTotal"),
  estimateStatus: document.querySelector("#estimateStatus"),
  estimateHeading: document.querySelector("#estimateHeading"),
  estimateNote: document.querySelector("#estimateNote"),
  estimateLines: document.querySelector("#estimateLines"),
  estimateWarnings: document.querySelector("#estimateWarnings"),
  wallSqm: document.querySelector("#wallSqm"),
  floorSqm: document.querySelector("#floorSqm"),
  tileLink: document.querySelector("#tileLink"),
  tilePrice: document.querySelector("#tilePrice"),
  tilingRate: document.querySelector("#tilingRate"),
};

const store = createPlannerStore();
let three = null;
let wallDrawMode = false;
let serviceDrawKey = null;
let activePointer = null;
let wallPreview = null;
let servicePreview = null;
let threeDragRemembered = false;

function state() {
  return store.state;
}

function selectedObject(id) {
  return state().objects.find((object) => object.id === id) || null;
}

function selectedWall(id) {
  return state().walls.find((wall) => wall.id === id) || null;
}

function render3d(nextState) {
  if (!three) {
    try {
      three = new SimpleRoom3D(dom.threeSurface, {
        onSelect(id) {
          state().selected = id ? { type: "object", id } : null;
          renderer.plan();
          renderer.selection();
          renderer.status();
          store.save();
        },
        onDragStart(id) {
          if (!threeDragRemembered) {
            store.remember();
            threeDragRemembered = true;
          }
          state().selected = { type: "object", id };
          renderer.plan();
          renderer.selection();
        },
        onDrag(object) {
          clampObjectToArea(object, state());
          renderer.plan();
          renderer.selection();
          renderer.status();
          renderer.estimate();
        },
        onDragEnd() {
          threeDragRemembered = false;
          store.notify();
        },
      });
    } catch (error) {
      console.error("3D planner could not start", error);
      dom.threeSurface.innerHTML =
        '<div class="three-help">3D could not start in this browser. The 2D planner still works normally.</div>';
      return;
    }
  }
  three.render(nextState);
  requestAnimationFrame(() => three?.resize());
}

const renderer = createPlannerRenderer(dom, store, {
  isDrawingWall: () => wallDrawMode,
  isDrawingService: () => Boolean(serviceDrawKey),
  serviceKey: () => serviceDrawKey,
  render3d,
});

function renderDuringPointer() {
  renderer.inputs();
  renderer.plan();
  renderer.selection();
  renderer.status();
  renderer.estimate();
  if (three && state().view === "3d") three.render(state());
}

function setWallDrawMode(enabled) {
  wallDrawMode = Boolean(enabled);
  if (wallDrawMode) serviceDrawKey = null;
  wallPreview = null;
  renderer.setWallPreview(null);
  renderer.setServicePreview(null);
  renderer.status();
}

function setServiceDrawMode(key = null) {
  serviceDrawKey = key;
  wallDrawMode = false;
  servicePreview = null;
  renderer.setWallPreview(null);
  renderer.setServicePreview(null);
  renderer.status();
}

function pairDimensions(text, family) {
  const triple = parseDimensionsFromText(text);
  if (triple) return triple;
  const clean = String(text || "")
    .toLowerCase()
    .replace(/%20/g, " ")
    .replace(/[-_/]/g, " ");
  const match = clean.match(/(\d{3,4})\s*(?:mm)?\s*[x×]\s*(\d{3,4})\s*(?:mm)?/);
  if (!match) return null;
  const base = PRODUCT_BY_FAMILY[family]?.dimensions;
  return base
    ? { width: Number(match[1]), depth: Number(match[2]), height: base.height }
    : null;
}

function inspectProductLink() {
  const url = dom.productUrl.value.trim();
  dom.productLinkFeedback.classList.remove("is-error");
  if (!url) {
    dom.productLinkFeedback.textContent = "Paste a retailer product link first.";
    return null;
  }
  let parsed;
  try {
    new URL(url);
    parsed = classifyProductLink(url);
  } catch {
    dom.productLinkFeedback.textContent = "That does not look like a complete product link.";
    dom.productLinkFeedback.classList.add("is-error");
    return null;
  }
  if (parsed.family && PRODUCT_BY_FAMILY[parsed.family]) dom.productFamily.value = parsed.family;
  const family = dom.productFamily.value;
  const dimensions = pairDimensions(`${url} ${parsed.inferredName || ""}`, family);
  const identified = PRODUCT_BY_FAMILY[family]?.label || "item";
  dom.productLinkFeedback.textContent = `${parsed.retailer ? `${parsed.retailer} · ` : ""}${identified}${dimensions ? ` · ${dimensions.width} × ${dimensions.depth}mm detected` : " · confirm dimensions after survey"}`;
  return { ...parsed, family, dimensions };
}

function addProductFromLink() {
  const inspected = inspectProductLink();
  if (!inspected) return;
  const url = dom.productUrl.value.trim();
  const family = dom.productFamily.value;
  const rawPrice = dom.productPrice.value.trim();
  const price = rawPrice === "" ? null : Math.max(0, number(rawPrice));
  store.addFixture(family, {
    price,
    dimensions: inspected.dimensions || undefined,
    metadata: {
      productName: inspected.inferredName || PRODUCT_BY_FAMILY[family].label,
      retailer: inspected.retailer || "",
      url,
      displayedPrice: price,
      missingInformation: inspected.dimensions ? [] : ["Exact dimensions"],
    },
  });
  dom.productUrl.value = "";
  dom.productPrice.value = "";
  dom.productLinkFeedback.textContent = "Product added to the plan and live estimate.";
}

function pointerWorld(event, metrics = planMetrics(state())) {
  const point = svgPoint(dom.planSvg, event);
  return {
    point,
    world: planToWorld(point.x, point.y, metrics),
    metrics,
  };
}

function beginPointer(event) {
  if (state().view !== "2d") return;
  const { point, world, metrics } = pointerWorld(event);

  if (wallDrawMode) {
    event.preventDefault();
    dom.planSvg.setPointerCapture(event.pointerId);
    const start = clampPointToRoom(world, state().room);
    activePointer = { type: "draw-wall", pointerId: event.pointerId, start };
    wallPreview = { x1: start.x, z1: start.z, x2: start.x, z2: start.z };
    renderer.setWallPreview(wallPreview);
    return;
  }

  if (serviceDrawKey) {
    event.preventDefault();
    dom.planSvg.setPointerCapture(event.pointerId);
    const start = clampPointToRoom(world, state().room);
    activePointer = {
      type: "draw-service",
      pointerId: event.pointerId,
      key: serviceDrawKey,
      start,
    };
    servicePreview = {
      key: serviceDrawKey,
      startX: start.x,
      startZ: start.z,
      x: start.x,
      z: start.z,
    };
    renderer.setServicePreview(servicePreview);
    return;
  }

  const rotateNode = event.target.closest("[data-object-rotate]");
  if (rotateNode) {
    event.preventDefault();
    store.rotateObject(rotateNode.dataset.objectRotate);
    return;
  }

  const objectNode = event.target.closest("[data-object-id]");
  const serviceStartNode = event.target.closest("[data-service-start]");
  const serviceEndNode = event.target.closest("[data-service-end]");
  const wallEndNode = event.target.closest("[data-wall-end]");
  const wallNode = event.target.closest("[data-wall-id]");
  const zoneResizeNode = event.target.closest("[data-zone-resize]");
  const zoneNode = event.target.closest("[data-zone]");
  const resizeNode = event.target.closest("[data-resize]");

  if (
    !objectNode &&
    !serviceStartNode &&
    !serviceEndNode &&
    !wallEndNode &&
    !wallNode &&
    !zoneResizeNode &&
    !zoneNode &&
    !resizeNode
  ) {
    state().selected = null;
    renderer.plan();
    renderer.selection();
    three?.setSelection(null);
    store.save();
    return;
  }

  event.preventDefault();
  dom.planSvg.setPointerCapture(event.pointerId);
  store.remember();

  if (objectNode) {
    const id = objectNode.dataset.objectId;
    const object = selectedObject(id);
    if (!object) return;
    state().selected = { type: "object", id };
    activePointer = {
      type: "object",
      pointerId: event.pointerId,
      id,
      offsetX: object.position.x - world.x,
      offsetZ: object.position.z - world.z,
    };
  } else if (serviceStartNode || serviceEndNode) {
    const node = serviceStartNode || serviceEndNode;
    const id = node.dataset.serviceStart || node.dataset.serviceEnd;
    state().selected = { type: "service", id };
    activePointer = {
      type: serviceStartNode ? "service-start" : "service-end",
      pointerId: event.pointerId,
      id,
    };
  } else if (wallEndNode) {
    const id = wallEndNode.dataset.wallId;
    state().selected = { type: "wall", id };
    activePointer = {
      type: "wall-end",
      pointerId: event.pointerId,
      id,
      end: wallEndNode.dataset.wallEnd,
    };
  } else if (wallNode) {
    const id = wallNode.dataset.wallId;
    const wall = selectedWall(id);
    if (!wall) return;
    state().selected = { type: "wall", id };
    activePointer = {
      type: "wall",
      pointerId: event.pointerId,
      id,
      start: world,
      wall: { ...wall },
    };
  } else if (zoneResizeNode) {
    state().selected = { type: "zone" };
    activePointer = {
      type: "zone-resize",
      pointerId: event.pointerId,
      handle: zoneResizeNode.dataset.zoneResize,
      zone: { ...state().zone },
    };
  } else if (zoneNode) {
    const zone = state().zone;
    state().selected = { type: "zone" };
    activePointer = {
      type: "zone",
      pointerId: event.pointerId,
      offsetX: zone.x - world.x,
      offsetZ: zone.z - world.z,
    };
  } else if (resizeNode) {
    activePointer = {
      type: "room-resize",
      pointerId: event.pointerId,
      mode: resizeNode.dataset.resize,
      point,
      room: { ...state().room },
      scale: metrics.scale,
    };
  }

  renderer.plan();
  renderer.selection();
}

function movePointer(event) {
  if (!activePointer || activePointer.pointerId !== event.pointerId) return;
  event.preventDefault();
  const { point, world } = pointerWorld(event);
  const current = state();

  if (activePointer.type === "draw-wall") {
    const end = clampPointToRoom(world, current.room);
    wallPreview = {
      x1: activePointer.start.x,
      z1: activePointer.start.z,
      x2: end.x,
      z2: end.z,
    };
    renderer.setWallPreview(wallPreview);
    return;
  }

  if (activePointer.type === "draw-service") {
    const end = clampPointToRoom(world, current.room);
    servicePreview = {
      key: activePointer.key,
      startX: activePointer.start.x,
      startZ: activePointer.start.z,
      x: end.x,
      z: end.z,
    };
    renderer.setServicePreview(servicePreview);
    return;
  }

  if (activePointer.type === "object") {
    const object = selectedObject(activePointer.id);
    if (!object) return;
    object.position.x = snap(world.x + activePointer.offsetX);
    object.position.z = snap(world.z + activePointer.offsetZ);
    clampObjectToArea(object, current);
    three?.moveObject(object);
  } else if (activePointer.type === "service-start") {
    const service = current.services[activePointer.id];
    const next = clampPointToRoom(world, current.room);
    service.startX = next.x;
    service.startZ = next.z;
    clampServiceToRoom(service, current.room);
  } else if (activePointer.type === "service-end") {
    const service = current.services[activePointer.id];
    const next = clampPointToRoom(world, current.room);
    service.x = next.x;
    service.z = next.z;
    clampServiceToRoom(service, current.room);
  } else if (activePointer.type === "wall-end") {
    const wall = selectedWall(activePointer.id);
    if (!wall) return;
    const next = clampPointToRoom(world, current.room);
    if (activePointer.end === "start") Object.assign(wall, { x1: next.x, z1: next.z });
    else Object.assign(wall, { x2: next.x, z2: next.z });
  } else if (activePointer.type === "wall") {
    const wall = selectedWall(activePointer.id);
    if (!wall) return;
    const dx = world.x - activePointer.start.x;
    const dz = world.z - activePointer.start.z;
    Object.assign(wall, {
      x1: activePointer.wall.x1 + dx,
      z1: activePointer.wall.z1 + dz,
      x2: activePointer.wall.x2 + dx,
      z2: activePointer.wall.z2 + dz,
    });
    clampWallToRoom(wall, current.room);
  } else if (activePointer.type === "zone") {
    current.zone.x = snap(world.x + activePointer.offsetX);
    current.zone.z = snap(world.z + activePointer.offsetZ);
    clampZone(current.zone, current.room);
    current.objects.forEach((object) => clampObjectToArea(object, current));
  } else if (activePointer.type === "zone-resize") {
    resizeZoneFromHandle(
      current.zone,
      activePointer.zone,
      activePointer.handle,
      world,
      current.room,
    );
    current.objects.forEach((object) => clampObjectToArea(object, current));
  } else if (activePointer.type === "room-resize") {
    const dx = (point.x - activePointer.point.x) / activePointer.scale;
    const dy = (point.y - activePointer.point.y) / activePointer.scale;
    if (activePointer.mode === "width" || activePointer.mode === "both") {
      current.room.width = snap(clamp(activePointer.room.width + dx * 2, 1, 8));
    }
    if (activePointer.mode === "length" || activePointer.mode === "both") {
      current.room.length = snap(clamp(activePointer.room.length + dy * 2, 1, 10));
    }
    if (current.zone) clampZone(current.zone, current.room);
    current.walls.forEach((wall) => clampWallToRoom(wall, current.room));
    Object.values(current.services).forEach((service) => clampServiceToRoom(service, current.room));
    current.objects.forEach((object) => clampObjectToArea(object, current));
  }

  renderDuringPointer();
}

function releasePointer(event) {
  try {
    dom.planSvg.releasePointerCapture(event.pointerId);
  } catch {
    // Pointer capture may already have been released.
  }
}

function endPointer(event) {
  if (!activePointer || activePointer.pointerId !== event.pointerId) return;

  if (activePointer.type === "draw-wall") {
    const preview = wallPreview;
    wallPreview = null;
    activePointer = null;
    renderer.setWallPreview(null);
    releasePointer(event);
    if (preview && Math.hypot(preview.x2 - preview.x1, preview.z2 - preview.z1) >= 0.2) {
      store.commit((current) => {
        const wall = createPartitionWall(current, preview);
        clampWallToRoom(wall, current.room);
        current.walls.push(wall);
        current.selected = { type: "wall", id: wall.id };
      });
    }
    setWallDrawMode(false);
    return;
  }

  if (activePointer.type === "draw-service") {
    const preview = servicePreview;
    const key = activePointer.key;
    servicePreview = null;
    activePointer = null;
    renderer.setServicePreview(null);
    releasePointer(event);
    if (preview && Math.hypot(preview.x - preview.startX, preview.z - preview.startZ) >= 0.1) {
      store.setServiceRoute(
        key,
        { x: preview.startX, z: preview.startZ },
        { x: preview.x, z: preview.z },
      );
    }
    setServiceDrawMode(null);
    return;
  }

  activePointer = null;
  releasePointer(event);
  store.notify();
}

function bindMeasurement(input, handler) {
  input.addEventListener("change", () => handler(input.value));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      input.blur();
    }
  });
}

function fileToCompressedDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the image."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("That image could not be opened."));
      image.onload = () => {
        const maximum = 1200;
        const ratio = Math.min(1, maximum / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * ratio));
        canvas.height = Math.max(1, Math.round(image.height * ratio));
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.76));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function bindEvents() {
  dom.routeChoices.addEventListener("click", (event) => {
    const button = event.target.closest("[data-route]");
    if (button) store.changeRoute(button.dataset.route);
  });

  bindMeasurement(dom.width, (value) => store.updateRoom("width", value));
  bindMeasurement(dom.length, (value) => store.updateRoom("length", value));
  bindMeasurement(dom.height, (value) => store.updateRoom("height", value));
  bindMeasurement(dom.zoneWidth, (value) => store.updateZone("width", value));
  bindMeasurement(dom.zoneDepth, (value) => store.updateZone("depth", value));

  dom.drawWall.addEventListener("click", () => {
    if (state().view !== "2d") {
      state().view = "2d";
      store.notify({ save: false });
    }
    setWallDrawMode(true);
  });
  dom.cancelDraw.addEventListener("click", () => {
    setWallDrawMode(false);
    setServiceDrawMode(null);
  });
  dom.clearWalls.addEventListener("click", () => store.clearWalls());

  dom.serviceList.addEventListener("click", (event) => {
    const draw = event.target.closest("[data-service-draw]");
    const hide = event.target.closest("[data-service-hide]");
    if (draw) {
      if (state().view !== "2d") {
        state().view = "2d";
        store.notify({ save: false });
      }
      setServiceDrawMode(draw.dataset.serviceDraw);
    }
    if (hide) store.hideService(hide.dataset.serviceHide);
  });

  dom.palette.addEventListener("click", (event) => {
    const button = event.target.closest("[data-family]");
    if (button) store.addFixture(button.dataset.family);
  });

  dom.selection.addEventListener("click", (event) => {
    const button = event.target.closest("[data-selection-action]");
    if (!button) return;
    if (button.dataset.selectionAction === "rotate") store.rotateSelection();
    if (button.dataset.selectionAction === "duplicate") store.duplicateSelection();
    if (button.dataset.selectionAction === "delete") store.removeSelection();
  });

  dom.productUrl.addEventListener("change", inspectProductLink);
  dom.productUrl.addEventListener("blur", () => {
    if (dom.productUrl.value.trim()) inspectProductLink();
  });
  dom.addProductLink.addEventListener("click", addProductFromLink);

  dom.photoInput.addEventListener("change", async () => {
    const file = dom.photoInput.files?.[0];
    if (!file) return;
    dom.photoStatus.textContent = "Preparing photo…";
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      store.setPhoto(dataUrl, file.name);
    } catch (error) {
      dom.photoStatus.textContent = error.message || "The photo could not be added.";
    } finally {
      dom.photoInput.value = "";
    }
  });
  dom.removePhoto.addEventListener("click", () => store.clearPhoto());

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      setWallDrawMode(false);
      setServiceDrawMode(null);
      state().view = button.dataset.view;
      store.notify();
      if (state().view === "3d") requestAnimationFrame(() => three?.fitCamera());
    });
  });

  dom.planSvg.addEventListener("pointerdown", beginPointer);
  dom.planSvg.addEventListener("pointermove", movePointer);
  dom.planSvg.addEventListener("pointerup", endPointer);
  dom.planSvg.addEventListener("pointercancel", endPointer);

  dom.clearFixtures.addEventListener("click", () => store.clearFixtures());
  dom.reset.addEventListener("click", () => store.reset());
  dom.undo.addEventListener("click", () => store.undo());
  dom.redo.addEventListener("click", () => store.redo());
  dom.centre3d.addEventListener("click", () => three?.fitCamera());

  bindMeasurement(dom.wallSqm, (value) => store.setTiling("wallSqm", value));
  bindMeasurement(dom.floorSqm, (value) => store.setTiling("floorSqm", value));
  bindMeasurement(dom.tilePrice, (value) => store.setTiling("tilePricePerSqm", value));
  dom.tileLink.addEventListener("change", () => store.setTiling("tileLink", dom.tileLink.value.trim()));

  dom.estimateToggle.addEventListener("click", () => {
    const open = dom.estimateToggle.getAttribute("aria-expanded") === "true";
    dom.estimateToggle.setAttribute("aria-expanded", String(!open));
    dom.estimateBreakdown.hidden = open;
  });

  window.addEventListener("keydown", (event) => {
    const typing = ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName);
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      event.shiftKey ? store.redo() : store.undo();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      store.redo();
    } else if (event.key === "Escape" && (wallDrawMode || serviceDrawKey)) {
      setWallDrawMode(false);
      setServiceDrawMode(null);
    } else if (!typing && (event.key === "Delete" || event.key === "Backspace")) {
      event.preventDefault();
      store.removeSelection();
    } else if (!typing && event.key.toLowerCase() === "r") {
      store.rotateSelection();
    }
  });
}

renderStaticControls(dom);
bindEvents();
store.subscribe((nextState, options = {}) => {
  if (options.render === false) {
    if (options.saved) dom.saveStatus.textContent = "Saved on this device";
    return;
  }
  renderer.all(options);
});
renderer.all({ save: false });
store.save();
