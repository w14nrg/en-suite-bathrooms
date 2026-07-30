import { PRODUCT_BY_FAMILY } from "../data/estimator-products.mjs";

export const DRAFT3_VERSION = 4;
export const DRAFT3_STORAGE_KEY = "ensuites-bathrooms-planner-draft-3";
export const TILING_LABOUR_RATE = 60;

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
    summary: "Standard room build and bathroom fitting with suitable nearby services.",
    note: "Products, tiling, difficult drainage, structural alterations and specialist works are added separately.",
  },
  cloakroom: {
    label: "Cloakroom",
    shortLabel: "Cloakroom",
    baseMinimum: null,
    baseMaximum: null,
    baseLabel: "Core cloakroom installation",
    summary: "The viability and core cost depend mainly on the toilet drainage route.",
    note: "A survey is required before the core installation price can be confirmed.",
  },
};

export const SERVICE_DEFINITIONS = {
  soil: {
    label: "Soil pipe",
    short: "Soil",
    colour: "#9a4334",
    icon: "fa-circle-dot",
    symbol: "soil",
    help: "Draw the approximate route to the soil stack or existing WC connection.",
  },
  waste: {
    label: "Waste exit",
    short: "Waste",
    colour: "#7d5a3f",
    icon: "fa-diamond",
    symbol: "waste",
    help: "Draw to the point where basin, shower or bath waste can leave the room.",
  },
  hot: {
    label: "Hot water",
    short: "Hot",
    colour: "#b94c3d",
    icon: "fa-fire-flame-simple",
    symbol: "pipe",
    help: "Draw the likely hot-water pipe route through the room.",
  },
  cold: {
    label: "Cold water",
    short: "Cold",
    colour: "#347b9a",
    icon: "fa-droplet",
    symbol: "pipe",
    help: "Draw the likely cold-water pipe route through the room.",
  },
  extractor: {
    label: "Extractor route",
    short: "Extract",
    colour: "#587b5f",
    icon: "fa-fan",
    symbol: "extractor",
    help: "Draw from the fan position towards the outside termination.",
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

const TOILET_FAMILIES = new Set([
  "wall-hung-toilet",
  "close-coupled-toilet",
  "back-to-wall-toilet",
]);
const WASTE_FAMILIES = new Set([
  "wall-mounted-basin",
  "freestanding-basin",
  "vanity-unit",
  "shower-tray",
  "square-enclosure",
  "rectangular-enclosure",
  "quadrant-enclosure",
  "walk-in-screen",
  "bath",
]);
const WATER_FAMILIES = new Set([
  ...WASTE_FAMILIES,
  ...TOILET_FAMILIES,
  "basin-tap",
  "concealed-shower",
  "exposed-shower",
]);

function id(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function serviceRoute(x = 0, z = 0) {
  return {
    known: false,
    startX: x - 0.35,
    startZ: z,
    x,
    z,
  };
}

export function createDraft3State(route = "bathroom") {
  const safeRoute = PROJECT_ROUTES[route] ? route : "bathroom";
  const room =
    safeRoute === "ensuite"
      ? { width: 3.8, length: 4.4, height: 2.4 }
      : safeRoute === "cloakroom"
        ? { width: 1.2, length: 1.6, height: 2.4 }
        : { width: 2.1, length: 2.45, height: 2.4 };

  const south = -room.length / 2 + 0.25;
  return {
    version: DRAFT3_VERSION,
    route: safeRoute,
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
    services: {
      soil: serviceRoute(0, south),
      waste: serviceRoute(-0.3, south),
      hot: serviceRoute(0.25, south),
      cold: serviceRoute(0.45, south),
      extractor: serviceRoute(room.width / 2 - 0.2, 0),
    },
    objects: [],
    tiling: {
      wallSqm: 0,
      floorSqm: 0,
      labourRate: TILING_LABOUR_RATE,
      tileLink: "",
      tilePricePerSqm: null,
      wastagePercent: 10,
    },
    photo: { dataUrl: "", name: "" },
    selected: null,
    view: "2d",
    updatedAt: new Date().toISOString(),
  };
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

function distance(a, b) {
  return Math.hypot(Number(a.x) - Number(b.x), Number(a.z) - Number(b.z));
}

function nearestDistance(objects, point, families) {
  const relevant = objects.filter((object) => families.has(object.family));
  if (!relevant.length || !point?.known) return null;
  return Math.min(...relevant.map((object) => distance(object.position, point)));
}

export function drainageAssessment(state) {
  const toilets = state.objects.filter((object) => TOILET_FAMILIES.has(object.family));
  const wetItems = state.objects.filter((object) => WASTE_FAMILIES.has(object.family));
  const soil = state.services.soil;
  const waste = state.services.waste;
  const result = {
    minimum: 0,
    maximum: 0,
    status: "No drainage changes added",
    surveyRequired: state.route === "cloakroom",
    warnings: [],
  };

  if (state.route === "cloakroom") {
    result.status = "Survey required for toilet drainage";
    result.warnings.push(
      "The cloakroom core price cannot be confirmed until the toilet drainage route is checked.",
    );
  }

  if (toilets.length) {
    if (!soil.known) {
      if (state.route === "ensuite") {
        result.minimum += 900;
        result.maximum += 2400;
        result.surveyRequired = true;
        result.status = "Provisional new drainage allowance";
        result.warnings.push(
          "The soil-pipe position is unknown, so the new en-suite drainage is provisional.",
        );
      } else if (state.route !== "cloakroom") {
        result.status = "Existing toilet position assumed";
        result.warnings.push(
          "The bathroom base assumes the toilet remains close to the existing soil connection.",
        );
      }
    } else {
      const soilDistance = nearestDistance(toilets, soil, TOILET_FAMILIES);
      if (soilDistance <= 1.2) {
        result.minimum += state.route === "ensuite" ? 250 : 0;
        result.maximum += state.route === "ensuite" ? 500 : 150;
        result.status = "Soil route appears close";
      } else if (soilDistance <= 2.5) {
        result.minimum += 650;
        result.maximum += 1300;
        result.status = "Drainage alteration likely";
      } else {
        result.minimum += 1500;
        result.maximum += 3200;
        result.surveyRequired = true;
        result.status = "Long soil route — survey required";
        result.warnings.push(
          "The planned toilet is more than 2.5m from the marked soil connection.",
        );
      }
    }
  }

  if (wetItems.length) {
    if (!waste.known && state.route === "ensuite") {
      result.minimum += 250;
      result.maximum += 700;
      result.warnings.push("The waste exit has not been marked for the new en-suite.");
    } else if (waste.known) {
      const wasteDistance = nearestDistance(wetItems, waste, WASTE_FAMILIES);
      if (wasteDistance > 2.5) {
        result.minimum += 350;
        result.maximum += 900;
        result.warnings.push(
          "One or more wet items are a long way from the marked waste exit.",
        );
      }
    }
  }

  return result;
}

export function calculateDraft3Estimate(state) {
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

  const wallArea = Math.max(0, Number(state.tiling.wallSqm || 0));
  const floorArea = Math.max(0, Number(state.tiling.floorSqm || 0));
  const totalArea = wallArea + floorArea;
  const labourRate = Math.max(0, Number(state.tiling.labourRate || TILING_LABOUR_RATE));
  const fitting = Math.round(totalArea * labourRate);
  const tilePrice = Math.max(0, Number(state.tiling.tilePricePerSqm || 0));
  const wastage = Math.max(0, Number(state.tiling.wastagePercent || 0));
  const tileOrderArea = totalArea * (1 + wastage / 100);
  const tileSupply = tilePrice > 0 ? Math.round(tileOrderArea * tilePrice) : 0;
  const tiling = {
    minimum: fitting + tileSupply,
    maximum: fitting + tileSupply,
    fitting,
    tileSupply,
    labourRate,
    wallArea,
    floorArea,
    totalArea,
    tileOrderArea,
    tilePricePerSqm: tilePrice,
  };

  const drainage = drainageAssessment(state);
  const wetItems = state.objects.filter((object) => WATER_FAMILIES.has(object.family));
  const knownWater = state.services.hot.known && state.services.cold.known;
  const water = { minimum: 0, maximum: 0, note: "Existing supplies assumed" };
  if (wetItems.length && knownWater) {
    const hotDistance = nearestDistance(wetItems, state.services.hot, WATER_FAMILIES);
    const coldDistance = nearestDistance(wetItems, state.services.cold, WATER_FAMILIES);
    const run = Math.max(hotDistance || 0, coldDistance || 0);
    if (run > 2.5) {
      water.minimum = 250;
      water.maximum = 700;
      water.note = "Longer hot and cold pipe runs";
    } else {
      water.note = "Marked supplies appear nearby";
    }
  } else if (state.route === "ensuite" && wetItems.length) {
    water.minimum = 250;
    water.maximum = 650;
    water.note = "Provisional new hot and cold supplies";
  }

  const additionsMinimum =
    products.minimum +
    walls.minimum +
    tiling.minimum +
    drainage.minimum +
    water.minimum;
  const additionsMaximum =
    products.maximum +
    walls.maximum +
    tiling.maximum +
    drainage.maximum +
    water.maximum;
  const hasCorePrice = Number.isFinite(route.baseMinimum);
  const minimum = hasCorePrice ? route.baseMinimum + additionsMinimum : additionsMinimum;
  const maximum = hasCorePrice ? route.baseMaximum + additionsMaximum : additionsMaximum;
  const surveyRequired = state.route === "cloakroom" || drainage.surveyRequired;

  return {
    route,
    minimum,
    maximum,
    hasCorePrice,
    surveyRequired,
    knownSelectionsMinimum: additionsMinimum,
    knownSelectionsMaximum: additionsMaximum,
    sections: {
      core: { minimum: route.baseMinimum, maximum: route.baseMaximum },
      products,
      walls,
      tiling,
      drainage,
      water,
    },
    warnings: drainage.warnings,
  };
}

export function formatEstimateMoney(value) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}
