import { PRODUCT_BY_FAMILY } from "../data/estimator-products.mjs";

export const DRAFT4_VERSION = 5;
export const DRAFT4_STORAGE_KEY = "ensuites-bathrooms-planner-draft-4";

export const PROJECT_ROUTES = {
  bathroom: {
    label: "Bathroom renovation",
    shortLabel: "Bathroom",
    baseMinimum: 4500,
    baseMaximum: 5200,
    baseLabel: "Core bathroom works",
    summary: "Strip-out and like-for-like bathroom fitting.",
    note: "Products, tiling, major layout changes, electrics and structural work are added separately.",
  },
  ensuite: {
    label: "Create a new en-suite",
    shortLabel: "New en-suite",
    baseMinimum: 7000,
    baseMaximum: 8500,
    baseLabel: "Core en-suite works",
    summary: "Standard room build and bathroom fitting, assuming suitable nearby services.",
    note: "Products, tiling, difficult drainage, structural alterations and specialist works are added separately.",
  },
  cloakroom: {
    label: "Cloakroom",
    shortLabel: "Cloakroom",
    baseMinimum: null,
    baseMaximum: null,
    baseLabel: "Core cloakroom installation",
    summary: "The core cost depends mainly on the toilet drainage route.",
    note: "A survey is required before the core installation price can be confirmed.",
  },
};

// Customer-facing installation bands supplied by the business. These already
// include the requested 15% addition to trade tiling rates. They are used only
// inside the predictor and are never printed as a per-m² rate in the UI.
export const TILING_CATEGORIES = {
  standard: {
    label: "Standard tiles (30×60 or 60×60cm)",
    minimum: 63.25,
    maximum: 80.5,
  },
  metro: {
    label: "Small-format or metro tiles",
    minimum: 80.5,
    maximum: 103.5,
  },
  large: {
    label: "Large-format tiles (60×120 or 120×120cm)",
    minimum: 80.5,
    maximum: 138,
  },
  slab: {
    label: "Porcelain slabs",
    minimum: 172.5,
    maximum: 253,
  },
  mosaic: {
    label: "Mesh-backed mosaics",
    minimum: 115,
    maximum: 172.5,
  },
  stone: {
    label: "Natural stone or marble",
    minimum: 103.5,
    maximum: 161,
  },
};

const PRODUCT_ALLOWANCES = {
  "wall-hung-toilet": [500, 950],
  "close-coupled-toilet": [250, 500],
  "back-to-wall-toilet": [400, 750],
  "concealed-cistern-frame": [280, 500],
  "wall-mounted-basin": [200, 450],
  "freestanding-basin": [350, 750],
  "vanity-unit": [350, 800],
  "shower-tray": [180, 350],
  "square-enclosure": [400, 800],
  "rectangular-enclosure": [500, 950],
  "quadrant-enclosure": [450, 850],
  "walk-in-screen": [350, 750],
  bath: [400, 850],
  "basin-tap": [100, 260],
  "concealed-shower": [350, 800],
  "exposed-shower": [250, 600],
  "heated-towel-rail": [150, 350],
  mirror: [150, 400],
};

const SHOWER_FAMILIES = new Set([
  "shower-tray",
  "square-enclosure",
  "rectangular-enclosure",
  "quadrant-enclosure",
  "walk-in-screen",
]);

function id(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function blankServices() {
  // Retained as empty internal geometry only because the shared 2D renderer
  // understands this shape. Draft 4 exposes no services controls or pricing.
  return {
    soil: { known: false, startX: 0, startZ: 0, x: 0, z: 0 },
    waste: { known: false, startX: 0, startZ: 0, x: 0, z: 0 },
    hot: { known: false, startX: 0, startZ: 0, x: 0, z: 0 },
    cold: { known: false, startX: 0, startZ: 0, x: 0, z: 0 },
    extractor: { known: false, startX: 0, startZ: 0, x: 0, z: 0 },
  };
}

export function createRouteDesign(route = "bathroom") {
  const safeRoute = PROJECT_ROUTES[route] ? route : "bathroom";
  const room =
    safeRoute === "ensuite"
      ? { width: 3.8, length: 4.4, height: 2.4 }
      : safeRoute === "cloakroom"
        ? { width: 1.2, length: 1.6, height: 2.4 }
        : { width: 2.1, length: 2.45, height: 2.4 };

  return {
    room,
    zone:
      safeRoute === "ensuite"
        ? {
            x: -0.85,
            z: -0.75,
            width: 1.7,
            depth: 1.5,
            height: room.height,
            wallThickness: 0.1,
          }
        : null,
    walls: [],
    services: blankServices(),
    objects: [],
    tiling: {
      wallCoverage: "none",
      floorIncluded: false,
      tileType: "standard",
      wallSqmOverride: null,
      floorSqmOverride: null,
      tileLink: "",
      tilePricePerSqm: null,
      tilePriceSource: "none",
      wastagePercent: 10,
    },
    photo: { dataUrl: "", name: "" },
    selected: null,
    view: "2d",
  };
}

export function createDraft4State(route = "bathroom") {
  const safeRoute = PROJECT_ROUTES[route] ? route : "bathroom";
  return {
    version: DRAFT4_VERSION,
    route: safeRoute,
    routeDrafts: {},
    ...createRouteDesign(safeRoute),
    updatedAt: new Date().toISOString(),
  };
}

export function routeDesignSnapshot(state) {
  return {
    room: structuredCloneSafe(state.room),
    zone: structuredCloneSafe(state.zone),
    walls: structuredCloneSafe(state.walls || []),
    services: blankServices(),
    objects: structuredCloneSafe(state.objects || []),
    tiling: structuredCloneSafe(state.tiling),
    photo: structuredCloneSafe(state.photo),
    selected: structuredCloneSafe(state.selected),
    view: state.view === "3d" ? "3d" : "2d",
  };
}

export function applyRouteDesign(state, route, design) {
  const next = design || createRouteDesign(route);
  state.route = route;
  state.room = structuredCloneSafe(next.room);
  state.zone = structuredCloneSafe(next.zone);
  state.walls = structuredCloneSafe(next.walls || []);
  state.services = blankServices();
  state.objects = structuredCloneSafe(next.objects || []);
  state.tiling = structuredCloneSafe(next.tiling);
  state.photo = structuredCloneSafe(next.photo);
  state.selected = structuredCloneSafe(next.selected);
  state.view = next.view === "3d" ? "3d" : "2d";
}

function structuredCloneSafe(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function workArea(state) {
  if (state.route === "ensuite" && state.zone) {
    return {
      minX: state.zone.x,
      maxX: state.zone.x + state.zone.width,
      minZ: state.zone.z,
      maxZ: state.zone.z + state.zone.depth,
      width: state.zone.width,
      depth: state.zone.depth,
      height: state.zone.height,
    };
  }
  return {
    minX: -state.room.width / 2,
    maxX: state.room.width / 2,
    minZ: -state.room.length / 2,
    maxZ: state.room.length / 2,
    width: state.room.width,
    depth: state.room.length,
    height: state.room.height,
  };
}

export function createPartitionWall(state, changes = {}) {
  const area = workArea(state);
  const length = Math.min(1.2, area.width * 0.6);
  return {
    id: id("wall"),
    x1: Number(changes.x1 ?? -length / 2),
    z1: Number(changes.z1 ?? 0),
    x2: Number(changes.x2 ?? length / 2),
    z2: Number(changes.z2 ?? 0),
    height: Number(changes.height ?? area.height),
    thickness: Number(changes.thickness ?? 0.1),
  };
}

export function wallLength(wall) {
  return Math.hypot(wall.x2 - wall.x1, wall.z2 - wall.z1);
}

export function productAllowance(object) {
  if (
    object.price !== null &&
    object.price !== "" &&
    Number.isFinite(Number(object.price)) &&
    Number(object.price) >= 0
  ) {
    const exact = Number(object.price);
    return { minimum: exact, maximum: exact, exact: true };
  }
  const allowance = PRODUCT_ALLOWANCES[object.family];
  if (!allowance) return { minimum: 0, maximum: 0, exact: false };
  return { minimum: allowance[0], maximum: allowance[1], exact: false };
}

function openingArea(state) {
  return state.objects.reduce((total, object) => {
    if (!["door", "window"].includes(object.family)) return total;
    return total + (Number(object.dimensions.width) / 1000) * (Number(object.dimensions.height) / 1000);
  }, 0);
}

function showerWallArea(state, area) {
  const shower = state.objects.find((object) => SHOWER_FAMILIES.has(object.family));
  if (shower) {
    const width = Number(shower.dimensions.width) / 1000;
    const depth = Number(shower.dimensions.depth) / 1000;
    const tiledHeight = Math.min(area.height, 2.2);
    return Math.max(3.5, (width + depth) * tiledHeight);
  }
  const bath = state.objects.find((object) => object.family === "bath");
  if (bath) {
    const length = Number(bath.dimensions.width) / 1000;
    const depth = Number(bath.dimensions.depth) / 1000;
    return Math.max(4.5, (length + depth) * Math.min(area.height, 1.8));
  }
  return Math.min((area.width + area.depth) * Math.min(area.height, 2.1), 6);
}

export function calculatedTilingAreas(state) {
  const area = workArea(state);
  const fullWallArea = Math.max(
    0,
    (area.width + area.depth) * 2 * area.height - openingArea(state),
  );
  const wall =
    state.tiling.wallCoverage === "full"
      ? fullWallArea
      : state.tiling.wallCoverage === "shower"
        ? showerWallArea(state, area)
        : 0;
  const floor = state.tiling.floorIncluded ? area.width * area.depth : 0;
  return {
    wall: Number(wall.toFixed(2)),
    floor: Number(floor.toFixed(2)),
  };
}

export function effectiveTilingAreas(state) {
  const calculated = calculatedTilingAreas(state);
  return {
    calculated,
    wall:
      state.tiling.wallSqmOverride === null || state.tiling.wallSqmOverride === ""
        ? calculated.wall
        : Math.max(0, Number(state.tiling.wallSqmOverride) || 0),
    floor:
      state.tiling.floorSqmOverride === null || state.tiling.floorSqmOverride === ""
        ? calculated.floor
        : Math.max(0, Number(state.tiling.floorSqmOverride) || 0),
  };
}

export function calculateDraft4Estimate(state) {
  const route = PROJECT_ROUTES[state.route] || PROJECT_ROUTES.bathroom;
  const products = state.objects.reduce(
    (total, object) => {
      const allowance = productAllowance(object);
      total.minimum += allowance.minimum;
      total.maximum += allowance.maximum;
      total.exactCount += allowance.exact ? 1 : 0;
      total.allowanceCount += allowance.exact || allowance.maximum === 0 ? 0 : 1;
      return total;
    },
    { minimum: 0, maximum: 0, exactCount: 0, allowanceCount: 0 },
  );

  const manualWallLength = state.walls.reduce(
    (total, wall) => total + wallLength(wall),
    0,
  );
  const walls = {
    minimum: Math.round(manualWallLength * 220),
    maximum: Math.round(manualWallLength * 340),
  };

  if (state.route === "ensuite" && state.zone) {
    const perimeter = (state.zone.width + state.zone.depth) * 2;
    const extraPerimeter = Math.max(0, perimeter - 7);
    walls.minimum += Math.round(extraPerimeter * 180);
    walls.maximum += Math.round(extraPerimeter * 300);
  }

  const areas = effectiveTilingAreas(state);
  const totalArea = areas.wall + areas.floor;
  const tileCategory = TILING_CATEGORIES[state.tiling.tileType] || TILING_CATEGORIES.standard;
  const fittingMinimum = Math.round(totalArea * tileCategory.minimum);
  const fittingMaximum = Math.round(totalArea * tileCategory.maximum);
  const tilePrice = Math.max(0, Number(state.tiling.tilePricePerSqm || 0));
  const wastage = Math.max(0, Number(state.tiling.wastagePercent || 0));
  const tileOrderArea = totalArea * (1 + wastage / 100);
  const tileSupply = tilePrice > 0 ? Math.round(tileOrderArea * tilePrice) : 0;
  const tiling = {
    minimum: fittingMinimum + tileSupply,
    maximum: fittingMaximum + tileSupply,
    fittingMinimum,
    fittingMaximum,
    tileSupply,
    tileType: state.tiling.tileType,
    tileTypeLabel: tileCategory.label,
    wallArea: areas.wall,
    floorArea: areas.floor,
    calculatedWallArea: areas.calculated.wall,
    calculatedFloorArea: areas.calculated.floor,
    totalArea,
    tileOrderArea,
    tilePricePerSqm: tilePrice,
  };

  const additionsMinimum = products.minimum + walls.minimum + tiling.minimum;
  const additionsMaximum = products.maximum + walls.maximum + tiling.maximum;
  const hasCorePrice = Number.isFinite(route.baseMinimum);
  const minimum = hasCorePrice ? route.baseMinimum + additionsMinimum : additionsMinimum;
  const maximum = hasCorePrice ? route.baseMaximum + additionsMaximum : additionsMaximum;
  const warnings = [];
  if (state.route === "ensuite") {
    warnings.push("The en-suite guide assumes a suitable route to nearby drainage, hot and cold water and ventilation; these are confirmed at survey.");
  }
  if (state.route === "cloakroom") {
    warnings.push("The core cloakroom installation remains survey required because the toilet drainage route must be checked.");
  }

  return {
    route,
    minimum,
    maximum,
    hasCorePrice,
    surveyRequired: state.route === "cloakroom",
    knownSelectionsMinimum: additionsMinimum,
    knownSelectionsMaximum: additionsMaximum,
    sections: {
      core: { minimum: route.baseMinimum, maximum: route.baseMaximum },
      products,
      walls,
      tiling,
    },
    warnings,
  };
}

export function formatEstimateMoney(value) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}
