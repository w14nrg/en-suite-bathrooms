import { PRODUCT_BY_FAMILY } from "../data/estimator-products.mjs";
import { makeObject } from "./estimator-core.mjs";
import {
  DRAFT2_STORAGE_KEY,
  DRAFT2_VERSION,
  PROJECT_ROUTES,
  SERVICE_DEFINITIONS,
  createDraft2State,
  workArea,
} from "./estimator-draft2-core.mjs";
import {
  ROOM_LIMITS,
  clamp,
  clampObjectToArea,
  clampPointToRoom,
  clampWallToRoom,
  clampZone,
  number,
  snap,
} from "./estimator-draft2-plan.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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

export function sanitiseDraft2State(candidate) {
  if (!candidate || candidate.version !== DRAFT2_VERSION || !PROJECT_ROUTES[candidate.route]) {
    return createDraft2State("bathroom");
  }
  const next = createDraft2State(candidate.route);
  next.room.width = clamp(number(candidate.room?.width, next.room.width), ...ROOM_LIMITS.width);
  next.room.length = clamp(number(candidate.room?.length, next.room.length), ...ROOM_LIMITS.length);
  next.room.height = clamp(number(candidate.room?.height, next.room.height), ...ROOM_LIMITS.height);
  next.zone = candidate.route === "ensuite" ? { ...next.zone, ...(candidate.zone || {}) } : null;
  if (next.zone) clampZone(next.zone, next.room);
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
  Object.keys(SERVICE_DEFINITIONS).forEach((key) => {
    const source = candidate.services?.[key];
    next.services[key] = {
      known: Boolean(source?.known),
      x: number(source?.x, next.services[key].x),
      z: number(source?.z, next.services[key].z),
    };
  });
  next.objects = Array.isArray(candidate.objects)
    ? candidate.objects.map(sanitiseObject).filter(Boolean)
    : [];
  next.tiling = {
    walls: ["none", "shower", "full"].includes(candidate.tiling?.walls)
      ? candidate.tiling.walls
      : "none",
    floor: Boolean(candidate.tiling?.floor),
  };
  next.selected = candidate.selected || null;
  next.view = candidate.view === "3d" ? "3d" : "2d";
  next.updatedAt = candidate.updatedAt || next.updatedAt;
  next.objects.forEach((object) => clampObjectToArea(object, next));
  next.walls.forEach((wall) => clampWallToRoom(wall, next.room));
  return next;
}

export function createPlannerStore(storage = globalThis.localStorage) {
  let state;
  try {
    state = sanitiseDraft2State(JSON.parse(storage.getItem(DRAFT2_STORAGE_KEY)));
  } catch {
    state = createDraft2State("bathroom");
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
        storage.setItem(DRAFT2_STORAGE_KEY, JSON.stringify(state));
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
    replace(next) {
      state = sanitiseDraft2State(next);
      api.notify();
    },
    undo() {
      if (!history.length) return;
      future.push(clone(state));
      state = sanitiseDraft2State(history.pop());
      api.notify();
    },
    redo() {
      if (!future.length) return;
      history.push(clone(state));
      state = sanitiseDraft2State(future.pop());
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
    setSelection(selected, options = {}) {
      state.selected = selected;
      api.notify({ save: options.save !== false, render3d: false });
    },
    addFixture(family, additions = {}) {
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
        if (additions.dimensions) {
          object.dimensions = { ...object.dimensions, ...additions.dimensions };
        }
        if (additions.metadata) {
          object.metadata = { ...object.metadata, ...additions.metadata };
        }
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
        if (state.selected.type === "service") {
          state.services[state.selected.id].known = false;
        }
        state.selected = null;
      });
    },
    rotateSelection() {
      const object = api.selectedObject();
      if (object) {
        api.commit(() => {
          object.rotation = ((object.rotation || 0) + 90) % 360;
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
        const blank =
          !state.objects.length &&
          !state.walls.length &&
          !Object.values(state.services).some((service) => service.known);
        const defaults = createDraft2State(route);
        state.route = route;
        if (blank) {
          state.room = clone(defaults.room);
          state.services = clone(defaults.services);
        }
        state.zone = route === "ensuite" ? state.zone || clone(defaults.zone) : null;
        if (state.zone) clampZone(state.zone, state.room);
        state.walls.forEach((wall) => clampWallToRoom(wall, state.room));
        state.objects.forEach((object) => clampObjectToArea(object, state));
        state.selected = null;
      });
    },
    updateRoom(key, value) {
      const [min, max] = ROOM_LIMITS[key];
      api.commit(() => {
        state.room[key] = snap(clamp(number(value, state.room[key]), min, max), 0.01);
        if (state.zone) clampZone(state.zone, state.room);
        state.walls.forEach((wall) => clampWallToRoom(wall, state.room));
        Object.values(state.services).forEach((service) =>
          Object.assign(service, clampPointToRoom(service, state.room)),
        );
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
    toggleService(key) {
      const service = state.services[key];
      if (!service) return;
      api.commit(() => {
        service.known = !service.known;
        if (service.known) {
          const area = workArea(state);
          service.x = snap((area.minX + area.maxX) / 2);
          service.z = snap(area.minZ + Math.min(0.25, area.depth / 4));
          state.selected = { type: "service", id: key };
        } else if (state.selected?.type === "service" && state.selected.id === key) {
          state.selected = null;
        }
      });
    },
    setTiling(key, value) {
      api.commit(() => {
        state.tiling[key] = value;
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
      state = createDraft2State(state.route);
      api.notify();
    },
  };

  return api;
}
