import { PRODUCT_BY_FAMILY } from "../data/estimator-products.mjs";
import { SERVICE_DEFINITIONS, workArea } from "./estimator-draft2-core.mjs";

export const SNAP = 0.05;
export const ROOM_LIMITS = { width: [1, 8], length: [1, 10], height: [1.8, 4] };

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function snap(value, step = SNAP) {
  return Math.round(value / step) * step;
}

export function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function formatMetres(value) {
  return `${number(value).toFixed(2)}m`;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function footprint(object) {
  const angle = ((object.rotation || 0) * Math.PI) / 180;
  const width = object.dimensions.width / 1000;
  const depth = object.dimensions.depth / 1000;
  return {
    width: Math.abs(Math.cos(angle)) * width + Math.abs(Math.sin(angle)) * depth,
    depth: Math.abs(Math.sin(angle)) * width + Math.abs(Math.cos(angle)) * depth,
  };
}

export function clampObjectToArea(object, state) {
  const area = workArea(state);
  const size = footprint(object);
  const minX = area.minX + size.width / 2;
  const maxX = area.maxX - size.width / 2;
  const minZ = area.minZ + size.depth / 2;
  const maxZ = area.maxZ - size.depth / 2;
  object.position.x = snap(minX <= maxX ? clamp(number(object.position.x), minX, maxX) : (area.minX + area.maxX) / 2);
  object.position.z = snap(minZ <= maxZ ? clamp(number(object.position.z), minZ, maxZ) : (area.minZ + area.maxZ) / 2);
  object.position.y = number(object.position.y);
}

export function clampPointToRoom(point, room) {
  return {
    x: snap(clamp(point.x, -room.width / 2, room.width / 2)),
    z: snap(clamp(point.z, -room.length / 2, room.length / 2)),
  };
}

export function clampWallToRoom(wall, room) {
  const first = clampPointToRoom({ x: wall.x1, z: wall.z1 }, room);
  const second = clampPointToRoom({ x: wall.x2, z: wall.z2 }, room);
  Object.assign(wall, { x1: first.x, z1: first.z, x2: second.x, z2: second.z });
}

export function clampZone(zone, room) {
  zone.width = snap(clamp(number(zone.width, 1.7), 1, Math.max(1, room.width)), 0.05);
  zone.depth = snap(clamp(number(zone.depth, 1.5), 1, Math.max(1, room.length)), 0.05);
  zone.height = room.height;
  zone.x = snap(clamp(number(zone.x), -room.width / 2, room.width / 2 - zone.width));
  zone.z = snap(clamp(number(zone.z), -room.length / 2, room.length / 2 - zone.depth));
}

export function planMetrics(state) {
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

export function worldToPlan(x, z, metrics) {
  return { x: metrics.centreX + x * metrics.scale, y: metrics.centreY - z * metrics.scale };
}

export function planToWorld(x, y, metrics) {
  return { x: (x - metrics.centreX) / metrics.scale, z: (metrics.centreY - y) / metrics.scale };
}

function gridLines(state, metrics) {
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

function fixtureShape(state, object, metrics) {
  const size = footprint(object);
  const position = worldToPlan(object.position.x, object.position.z, metrics);
  const width = Math.max(16, size.width * metrics.scale);
  const height = Math.max(16, size.depth * metrics.scale);
  const selected = state.selected?.type === "object" && object.id === state.selected.id;
  const product = PRODUCT_BY_FAMILY[object.family];
  const label = object.metadata?.productName || product?.label || object.label;
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
  const short = label.length > 24 ? `${label.slice(0, 22)}…` : label;
  return `<g class="plan-fixture ${selected ? "is-selected" : ""}" data-object-id="${object.id}" transform="translate(${position.x} ${position.y}) rotate(${-object.rotation})"><g>${shape}</g><text x="0" y="${height / 2 + 20}" transform="rotate(${object.rotation})">${escapeHtml(short)}</text></g>`;
}

function zoneShape(state, metrics) {
  if (!state.zone) return "";
  const topLeft = worldToPlan(state.zone.x, state.zone.z + state.zone.depth, metrics);
  const width = state.zone.width * metrics.scale;
  const height = state.zone.depth * metrics.scale;
  const selected = state.selected?.type === "zone";
  return `<g><rect class="plan-zone ${selected ? "is-selected" : ""}" data-zone="move" x="${topLeft.x}" y="${topLeft.y}" width="${width}" height="${height}" rx="3"/><text class="zone-label" x="${topLeft.x + width / 2}" y="${topLeft.y + height / 2}">NEW EN-SUITE</text><rect class="zone-resize-handle" data-zone-resize="both" x="${topLeft.x + width - 12}" y="${topLeft.y - 12}" width="24" height="24" rx="6"/></g>`;
}

function wallShapes(state, metrics) {
  return state.walls.map((wall) => {
    const first = worldToPlan(wall.x1, wall.z1, metrics);
    const second = worldToPlan(wall.x2, wall.z2, metrics);
    const selected = state.selected?.type === "wall" && state.selected.id === wall.id;
    return `<g><line class="plan-wall ${selected ? "is-selected" : ""}" data-wall-id="${wall.id}" x1="${first.x}" y1="${first.y}" x2="${second.x}" y2="${second.y}"/>${selected ? `<circle class="wall-handle" data-wall-end="start" data-wall-id="${wall.id}" cx="${first.x}" cy="${first.y}" r="11"/><circle class="wall-handle" data-wall-end="end" data-wall-id="${wall.id}" cx="${second.x}" cy="${second.y}" r="11"/>` : ""}</g>`;
  }).join("");
}

function serviceShapes(state, metrics) {
  return Object.entries(state.services).filter(([, service]) => service.known).map(([key, service]) => {
    const definition = SERVICE_DEFINITIONS[key];
    const point = worldToPlan(service.x, service.z, metrics);
    const selected = state.selected?.type === "service" && state.selected.id === key;
    return `<g class="service-marker ${selected ? "is-selected" : ""}" data-service-id="${key}" transform="translate(${point.x} ${point.y})"><circle r="18" fill="${definition.colour}"/><circle r="24" stroke="${definition.colour}"/><text x="0" y="5">${definition.short.slice(0, 1)}</text></g>`;
  }).join("");
}

export function renderPlanSvg(svg, state, wallPreview = null) {
  const metrics = planMetrics(state);
  const left = metrics.centreX - metrics.roomWidth / 2;
  const right = metrics.centreX + metrics.roomWidth / 2;
  const top = metrics.centreY - metrics.roomHeight / 2;
  const bottom = metrics.centreY + metrics.roomHeight / 2;
  let preview = "";
  if (wallPreview) {
    const a = worldToPlan(wallPreview.x1, wallPreview.z1, metrics);
    const b = worldToPlan(wallPreview.x2, wallPreview.z2, metrics);
    preview = `<line class="wall-preview" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
  }
  svg.innerHTML = `<defs><filter id="selectedGlow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="0" stdDeviation="5" flood-opacity="0.28"/></filter></defs><rect class="plan-room" x="${left}" y="${top}" width="${metrics.roomWidth}" height="${metrics.roomHeight}" rx="3"/><g class="plan-grid">${gridLines(state, metrics)}</g>${zoneShape(state, metrics)}<g>${wallShapes(state, metrics)}${preview}</g><g>${state.objects.map((object) => fixtureShape(state, object, metrics)).join("")}</g><g>${serviceShapes(state, metrics)}</g><line class="dimension-line" x1="${left}" y1="${top - 42}" x2="${right}" y2="${top - 42}"/><line class="dimension-tick" x1="${left}" y1="${top - 52}" x2="${left}" y2="${top - 32}"/><line class="dimension-tick" x1="${right}" y1="${top - 52}" x2="${right}" y2="${top - 32}"/><text class="dimension-text" x="${metrics.centreX}" y="${top - 55}">${formatMetres(state.room.width)}</text><line class="dimension-line" x1="${right + 42}" y1="${top}" x2="${right + 42}" y2="${bottom}"/><line class="dimension-tick" x1="${right + 32}" y1="${top}" x2="${right + 52}" y2="${top}"/><line class="dimension-tick" x1="${right + 32}" y1="${bottom}" x2="${right + 52}" y2="${bottom}"/><text class="dimension-text side" x="${right + 68}" y="${metrics.centreY}" transform="rotate(90 ${right + 68} ${metrics.centreY})">${formatMetres(state.room.length)}</text><g><circle class="resize-handle" data-resize="width" cx="${right}" cy="${metrics.centreY}" r="13"/><circle class="resize-handle" data-resize="length" cx="${metrics.centreX}" cy="${bottom}" r="13"/><rect class="resize-handle corner" data-resize="both" x="${right - 12}" y="${bottom - 12}" width="24" height="24" rx="6"/></g>`;
  return metrics;
}

export function svgPoint(svg, event) {
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(svg.getScreenCTM().inverse());
}

export function overlapWarnings(state) {
  const warnings = [];
  for (let index = 0; index < state.objects.length; index += 1) {
    const first = state.objects[index];
    const aSize = footprint(first);
    const a = { minX: first.position.x - aSize.width / 2, maxX: first.position.x + aSize.width / 2, minZ: first.position.z - aSize.depth / 2, maxZ: first.position.z + aSize.depth / 2 };
    for (let other = index + 1; other < state.objects.length; other += 1) {
      const second = state.objects[other];
      const bSize = footprint(second);
      const b = { minX: second.position.x - bSize.width / 2, maxX: second.position.x + bSize.width / 2, minZ: second.position.z - bSize.depth / 2, maxZ: second.position.z + bSize.depth / 2 };
      if (!(a.maxX <= b.minX + 0.02 || a.minX >= b.maxX - 0.02 || a.maxZ <= b.minZ + 0.02 || a.minZ >= b.maxZ - 0.02)) warnings.push(`${first.label} overlaps ${second.label}`);
    }
  }
  return warnings;
}
