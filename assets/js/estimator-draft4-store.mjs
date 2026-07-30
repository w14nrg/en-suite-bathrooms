import { PRODUCT_BY_FAMILY } from "../data/estimator-products.mjs";
import { makeObject } from "./estimator-core.mjs";
import {
  DRAFT4_STORAGE_KEY,
  DRAFT4_VERSION,
  PROJECT_ROUTES,
  TILING_CATEGORIES,
  applyRouteDesign,
  blankServices,
  createDraft4State,
  createRouteDesign,
  routeDesignSnapshot,
  workArea,
} from "./estimator-draft4-core.mjs";
import {
  ROOM_LIMITS,
  clamp,
  clampObjectToArea,
  clampWallToRoom,
  clampZone,
  number,
  snap,
} from "./estimator-draft3-plan.mjs";

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitiseObject(object) {
  if (!object || !PRODUCT_BY_FAMILY[object.family]) return null;
  const base = makeObject(object.family);
  return {
    ...base,
    ...object,
    dimensions: { ...base.dimensions, ...(object.dimensions || {}) },
    position: { ...base.position, ...(object.position || {}) },
    metadata: { ...base.metadata, ...(object.metadata || {}) },
  };
}

function sanitiseDesign(candidate, route) {
  const next = createRouteDesign(route);
  if (!candidate || typeof candidate !== "object") return next;
  next.room.width = clamp(number(candidate.room?.width, next.room.width), ...ROOM_LIMITS.width);
  next.room.length = clamp(number(candidate.room?.length, next.room.length), ...ROOM_LIMITS.length);
  next.room.height = clamp(number(candidate.room?.height, next.room.height), ...ROOM_LIMITS.height);
  next.zone = route === "ensuite" ? { ...next.zone, ...(candidate.zone || {}) } : null;
  if (next.zone) {
    next.zone.height = next.room.height;
    clampZone(next.zone, next.room);
  }
  next.walls = Array.isArray(candidate.walls)
    ? candidate.walls.map((wall) => ({
        id: wall.id || createId("wall"),
        x1: number(wall.x1),
        z1: number(wall.z1),
        x2: number(wall.x2),
        z2: number(wall.z2),
        height: clamp(number(wall.height, next.room.height), 0.5, next.room.height),
        thickness: clamp(number(wall.thickness, 0.1), 0.05, 0.3),
      }))
    : [];
  next.services = blankServices();
  next.objects = Array.isArray(candidate.objects)
    ? candidate.objects.map(sanitiseObject).filter(Boolean)
    : [];
  const wallCoverage = ["none", "shower", "full"].includes(candidate.tiling?.wallCoverage)
    ? candidate.tiling.wallCoverage
    : next.tiling.wallCoverage;
  const tileType = TILING_CATEGORIES[candidate.tiling?.tileType]
    ? candidate.tiling.tileType
    : next.tiling.tileType;
  next.tiling = {
    wallCoverage,
    floorIncluded: Boolean(candidate.tiling?.floorIncluded),
    tileType,
    wallSqmOverride:
      candidate.tiling?.wallSqmOverride === null || candidate.tiling?.wallSqmOverride === ""
        ? null
        : Math.max(0, number(candidate.tiling?.wallSqmOverride)),
    floorSqmOverride:
      candidate.tiling?.floorSqmOverride === null || candidate.tiling?.floorSqmOverride === ""
        ? null
        : Math.max(0, number(candidate.tiling?.floorSqmOverride)),
    tileLink: String(candidate.tiling?.tileLink || ""),
    tilePricePerSqm:
      candidate.tiling?.tilePricePerSqm === null || candidate.tiling?.tilePricePerSqm === ""
        ? null
        : Math.max(0, number(candidate.tiling?.tilePricePerSqm)),
    tilePriceSource: ["none", "extracted", "manual"].includes(candidate.tiling?.tilePriceSource)
      ? candidate.tiling.tilePriceSource
      : "none",
    wastagePercent: clamp(number(candidate.tiling?.wastagePercent, 10), 0, 30),
  };
  next.photo = {
    dataUrl: String(candidate.photo?.dataUrl || ""),
    name: String(candidate.photo?.name || ""),
  };
  next.selected = candidate.selected || null;
  next.view = candidate.view === "3d" ? "3d" : "2d";
  next.objects.forEach((object) => clampObjectToArea(object, { route, ...next }));
  next.walls.forEach((wall) => clampWallToRoom(wall, next.room));
  return next;
}

export function sanitiseDraft4State(candidate) {
  if (!candidate || candidate.version !== DRAFT4_VERSION || !PROJECT_ROUTES[candidate.route]) {
    return createDraft4State("bathroom");
  }
  const next = createDraft4State(candidate.route);
  const active = sanitiseDesign(candidate, candidate.route);
  applyRouteDesign(next, candidate.route, active);
  next.routeDrafts = {};
  Object.keys(PROJECT_ROUTES).forEach((route) => {
    if (route === candidate.route) return;
    if (candidate.routeDrafts?.[route]) {
      next.routeDrafts[route] = sanitiseDesign(candidate.routeDrafts[route], route);
    }
  });
  next.updatedAt = candidate.updatedAt || next.updatedAt;
  return next;
}

export function createPlannerStore(storage = globalThis.localStorage) {
  let state;
  try {
    state = sanitiseDraft4State(JSON.parse(storage.getItem(DRAFT4_STORAGE_KEY)));
  } catch {
    state = createDraft4State("bathroom");
  }
  let history = [];
  let future = [];
  let saveTimer = null;
  const listeners = new Set();

  const api = {
    get state() {
      return state;
    },
    get canUndo() {
      return history.length > 0;
    },
    get canRedo() {
      return future.length > 0;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    notify(options = {}) {
      listeners.forEach((listener) => listener(state, options));
      if (options.save !== false) api.save();
    },
    save() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        state.updatedAt = new Date().toISOString();
        try {
          storage.setItem(DRAFT4_STORAGE_KEY, JSON.stringify(state));
        } catch (error) {
          if (state.photo?.dataUrl) {
            state.photo = { dataUrl: "", name: state.photo.name || "Current bathroom photo" };
            storage.setItem(DRAFT4_STORAGE_KEY, JSON.stringify(state));
          } else {
            throw error;
          }
        }
        listeners.forEach((listener) => listener(state, { saved: true, render: false }));
      }, 180);
    },
    remember() {
      history.push(clone(state));
      if (history.length > 60) history.shift();
      future = [];
    },
    commit(mutator, options = {}) {
      api.remember();
      mutator(state);
      api.notify(options);
    },
    undo() {
      if (!history.length) return;
      future.push(clone(state));
      state = sanitiseDraft4State(history.pop());
      api.notify();
    },
    redo() {
      if (!future.length) return;
      history.push(clone(state));
      state = sanitiseDraft4State(future.pop());
      api.notify();
    },
    selectedObject() {
      return state.selected?.type === "object"
        ? state.objects.find((item) => item.id === state.selected.id) || null
        : null;
    },
    selectedWall() {
      return state.selected?.type === "wall"
        ? state.walls.find((item) => item.id === state.selected.id) || null
        : null;
    },
    addFixture(family, additions = {}) {
      if (!PRODUCT_BY_FAMILY[family]) return;
      api.commit(() => {
        const object = makeObject(family);
        const area = workArea(state);
        const candidates = [
          [(area.minX + area.maxX) / 2, (area.minZ + area.maxZ) / 2],
          [area.minX + area.width * 0.27, area.minZ + area.depth * 0.27],
          [area.maxX - area.width * 0.27, area.minZ + area.depth * 0.27],
          [area.minX + area.width * 0.27, area.maxZ - area.depth * 0.27],
          [area.maxX - area.width * 0.27, area.maxZ - area.depth * 0.27],
        ];
        const chosen = candidates[Math.min(state.objects.length, candidates.length - 1)];
        object.position.x = chosen[0];
        object.position.z = chosen[1];
        if ("price" in additions) object.price = additions.price;
        if (additions.colour) object.colour = additions.colour;
        if (additions.dimensions) object.dimensions = { ...object.dimensions, ...additions.dimensions };
        if (additions.metadata) object.metadata = { ...object.metadata, ...additions.metadata };
        clampObjectToArea(object, state);
        state.objects.push(object);
        state.selected = { type: "object", id: object.id };
      });
    },
    removeSelection() {
      if (!state.selected) return;
      api.commit(() => {
        if (state.selected.type === "object") {
          state.objects = state.objects.filter((item) => item.id !== state.selected.id);
        }
        if (state.selected.type === "wall") {
          state.walls = state.walls.filter((item) => item.id !== state.selected.id);
        }
        state.selected = null;
      });
    },
    rotateSelection() {
      const object = api.selectedObject();
      if (object) {
        api.commit(() => {
          object.rotation = ((Number(object.rotation) || 0) + 90) % 360;
          clampObjectToArea(object, state);
        });
        return;
      }
      const wall = api.selectedWall();
      if (!wall) return;
      api.commit(() => {
        const cx = (wall.x1 + wall.x2) / 2;
        const cz = (wall.z1 + wall.z2) / 2;
        const dx = wall.x2 - wall.x1;
        const dz = wall.z2 - wall.z1;
        Object.assign(wall, {
          x1: cx + dz / 2,
          z1: cz - dx / 2,
          x2: cx - dz / 2,
          z2: cz + dx / 2,
        });
        clampWallToRoom(wall, state.room);
      });
    },
    rotateObject(id) {
      const object = state.objects.find((item) => item.id === id);
      if (!object) return;
      api.commit(() => {
        state.selected = { type: "object", id };
        object.rotation = ((Number(object.rotation) || 0) + 90) % 360;
        clampObjectToArea(object, state);
      });
    },
    duplicateSelection() {
      const object = api.selectedObject();
      if (!object) return;
      api.commit(() => {
        const copy = makeObject(object.family, {
          x: object.position.x + 0.15,
          z: object.position.z + 0.15,
          rotation: object.rotation,
        });
        copy.dimensions = clone(object.dimensions);
        copy.colour = object.colour;
        copy.price = object.price;
        copy.metadata = clone(object.metadata);
        clampObjectToArea(copy, state);
        state.objects.push(copy);
        state.selected = { type: "object", id: copy.id };
      });
    },
    changeRoute(route) {
      if (!PROJECT_ROUTES[route] || route === state.route) return;
      api.commit(() => {
        const currentRoute = state.route;
        state.routeDrafts[currentRoute] = routeDesignSnapshot(state);
        const target = state.routeDrafts[route]
          ? sanitiseDesign(state.routeDrafts[route], route)
          : createRouteDesign(route);
        delete state.routeDrafts[route];
        applyRouteDesign(state, route, target);
        state.selected = null;
      });
    },
    updateRoom(key, value) {
      const [min, max] = ROOM_LIMITS[key];
      api.commit(() => {
        state.room[key] = snap(clamp(number(value, state.room[key]), min, max), 0.01);
        if (state.zone) {
          state.zone.height = state.room.height;
          clampZone(state.zone, state.room);
        }
        state.walls.forEach((wall) => {
          wall.height = Math.min(wall.height, state.room.height);
          clampWallToRoom(wall, state.room);
        });
        state.objects.forEach((object) => clampObjectToArea(object, state));
      });
    },
    updateZone(key, value) {
      if (!state.zone) return;
      api.commit(() => {
        state.zone[key] = number(value, state.zone[key]);
        clampZone(state.zone, state.room);
        state.objects.forEach((object) => clampObjectToArea(object, state));
      });
    },
    setTiling(key, value) {
      api.commit(() => {
        if (["wallSqmOverride", "floorSqmOverride", "tilePricePerSqm", "wastagePercent"].includes(key)) {
          state.tiling[key] = value === "" || value === null ? null : Math.max(0, number(value));
        } else if (key === "floorIncluded") {
          state.tiling.floorIncluded = Boolean(value);
          if (!state.tiling.floorIncluded) state.tiling.floorSqmOverride = null;
        } else if (key === "wallCoverage") {
          state.tiling.wallCoverage = ["none", "shower", "full"].includes(value) ? value : "none";
          if (state.tiling.wallCoverage === "none") state.tiling.wallSqmOverride = null;
        } else if (key === "tileType") {
          state.tiling.tileType = TILING_CATEGORIES[value] ? value : "standard";
        } else if (key === "tilePriceSource") {
          state.tiling.tilePriceSource = ["none", "extracted", "manual"].includes(value) ? value : "none";
        } else {
          state.tiling[key] = String(value || "");
        }
      });
    },
    resetCalculatedAreas() {
      api.commit(() => {
        state.tiling.wallSqmOverride = null;
        state.tiling.floorSqmOverride = null;
      });
    },
    setPhoto(dataUrl, name) {
      api.commit(() => {
        state.photo = { dataUrl: String(dataUrl || ""), name: String(name || "") };
      });
    },
    clearPhoto() {
      if (!state.photo?.dataUrl && !state.photo?.name) return;
      api.commit(() => {
        state.photo = { dataUrl: "", name: "" };
      });
    },
    clearFixtures() {
      if (!state.objects.length) return;
      api.commit(() => {
        state.objects = [];
        if (state.selected?.type === "object") state.selected = null;
      });
    },
    clearWalls() {
      if (!state.walls.length) return;
      api.commit(() => {
        state.walls = [];
        if (state.selected?.type === "wall") state.selected = null;
      });
    },
    reset() {
      api.remember();
      const drafts = state.routeDrafts;
      const route = state.route;
      state = {
        version: DRAFT4_VERSION,
        route,
        routeDrafts: drafts,
        ...createRouteDesign(route),
        updatedAt: new Date().toISOString(),
      };
      api.notify();
    },
  };

  return api;
}
