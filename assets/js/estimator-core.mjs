import { PRODUCT_BY_FAMILY } from "../data/estimator-products.mjs";
import { PRODUCT_LINK_RULES, RETAILER_RULES } from "../data/estimator-mappings.mjs";
import { ESTIMATE_SECTIONS, PRICING_CONFIG } from "../data/estimator-pricing.mjs";

export const STORAGE_KEY = "ensuites-bathrooms-estimator-draft-1";
export const PROJECT_VERSION = 1;

const severityOrder = {
  "Likely straightforward": 0,
  "Possible but requires alteration": 1,
  "Survey required": 2,
  "Current arrangement appears impractical": 3,
};

export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createId(prefix = "item") {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

function starterObjects(route) {
  if (route === "cloakroom") {
    return [
      makeObject("close-coupled-toilet", { x: 0, z: -0.18, rotation: 0 }),
      makeObject("wall-mounted-basin", { x: 0.34, z: 0.49, rotation: -90 }),
    ];
  }
  if (route === "newEnsuite") {
    return [
      makeObject("wall-hung-toilet", { x: 0.35, z: 0.62, rotation: 180 }),
      makeObject("vanity-unit", { x: 1.28, z: 0.72, rotation: 90 }),
      makeObject("square-enclosure", { x: 0.25, z: 1.45, rotation: 0 }),
    ];
  }
  return [
    makeObject("close-coupled-toilet", { x: -0.62, z: -0.46, rotation: 0 }),
    makeObject("vanity-unit", { x: 0.47, z: -0.52, rotation: 0 }),
    makeObject("rectangular-enclosure", { x: -0.35, z: 0.52, rotation: 180 }),
  ];
}

export function makeObject(family, overrides = {}) {
  const product = PRODUCT_BY_FAMILY[family];
  if (!product) throw new Error(`Unknown product family: ${family}`);
  return {
    id: createId(family),
    family,
    label: product.label,
    category: product.category,
    dimensions: deepClone(product.dimensions),
    colour: product.colour,
    position: {
      x: Number(overrides.x ?? 0),
      y: Number(overrides.y ?? 0),
      z: Number(overrides.z ?? 0),
    },
    rotation: Number(overrides.rotation ?? 0),
    price: null,
    metadata: {
      productName: "",
      retailer: "",
      url: "",
      displayedPrice: null,
      image: "",
      finish: "",
      importConfidence: null,
      missingInformation: ["Product price", "Exact dimensions"],
    },
  };
}

export function createDefaultProject(route = "existing") {
  const isNew = route === "newEnsuite";
  const isCloak = route === "cloakroom";
  const room = isNew
    ? { length: 4.2, width: 3.6, height: 2.4 }
    : isCloak
      ? { length: 1.5, width: 1.15, height: 2.4 }
      : { length: 2.45, width: 2.1, height: 2.4 };

  return {
    version: PROJECT_VERSION,
    id: createId("project"),
    route,
    updatedAt: new Date().toISOString(),
    room: {
      ...room,
      openings: [
        {
          id: createId("door"),
          type: "door",
          wall: "south",
          offset: isNew ? 1.1 : 0,
          width: 0.76,
          height: 2.04,
          sillHeight: 0,
          opening: "inward-left",
        },
        {
          id: createId("window"),
          type: "window",
          wall: "north",
          offset: 0,
          width: isCloak ? 0.6 : 0.9,
          height: 0.9,
          sillHeight: 1.05,
          opening: "fixed",
        },
      ],
      features: {
        rooflight: false,
        slope: { enabled: false, wall: "north", startHeight: 1.3, depth: 0.75 },
      },
    },
    ensuite: isNew
      ? {
          x: -0.2,
          z: 0.25,
          width: 2,
          depth: 1.65,
          height: 2.4,
          wallThickness: 0.1,
          door: {
            wall: "south",
            offset: 0.35,
            width: 0.76,
            type: "outward",
          },
          partitions: [],
        }
      : null,
    services: {
      soil: { known: false, x: 0, z: -room.length / 2 },
      nearestBathroom: { known: false, distance: null, direction: "unknown" },
      water: { known: false, x: 0, z: 0 },
      extractor: { known: false, x: room.width / 2, z: 0 },
      floorConstruction: "unknown",
      joistDirection: "unknown",
    },
    objects: starterObjects(route),
    finishes: {
      wallSelection: "all",
      selectedWall: "north",
      tileHeight: room.height,
      tileWidthMm: 300,
      tileHeightMm: 600,
      wallTilePricePerSqm: null,
      wallTilePricePerBox: null,
      wallTileBoxCoverage: null,
      wallTileLink: "",
      wallTileImage: "",
      floorTileWidthMm: 600,
      floorTileHeightMm: 600,
      floorTilePricePerSqm: null,
      floorTilePricePerBox: null,
      floorTileBoxCoverage: null,
      floorTileLink: "",
      floorTileImage: "",
      wastagePercent: PRICING_CONFIG.tileWastageDefault,
      groutColour: "#d8d4ca",
      layingDirection: "straight",
      wallColour: "#d9d1c3",
      floorColour: "#b9aa96",
    },
    customer: { name: "", telephone: "", email: "" },
    notes: "",
  };
}

export function workArea(project) {
  if (project.route === "newEnsuite" && project.ensuite) {
    return {
      minX: project.ensuite.x,
      maxX: project.ensuite.x + project.ensuite.width,
      minZ: project.ensuite.z,
      maxZ: project.ensuite.z + project.ensuite.depth,
      width: project.ensuite.width,
      depth: project.ensuite.depth,
      height: project.ensuite.height,
    };
  }
  return {
    minX: -project.room.width / 2,
    maxX: project.room.width / 2,
    minZ: -project.room.length / 2,
    maxZ: project.room.length / 2,
    width: project.room.width,
    depth: project.room.length,
    height: project.room.height,
  };
}

export function addProduct(project, family, position = {}) {
  const area = workArea(project);
  const fallback = {
    x: (area.minX + area.maxX) / 2,
    z: (area.minZ + area.maxZ) / 2,
  };
  const object = makeObject(family, {
    x: position.x ?? fallback.x,
    z: position.z ?? fallback.z,
    y: position.y ?? 0,
    rotation: position.rotation ?? 0,
  });
  project.objects.push(object);
  return object;
}

export function swapProductFamily(object, family) {
  const product = PRODUCT_BY_FAMILY[family];
  if (!product) throw new Error(`Unknown product family: ${family}`);
  object.family = family;
  object.label = product.label;
  object.category = product.category;
  object.dimensions = deepClone(product.dimensions);
  object.colour = object.metadata?.finish ? object.colour : product.colour;
  return object;
}

function footprint(object) {
  const angle = ((object.rotation || 0) * Math.PI) / 180;
  const width = object.dimensions.width / 1000;
  const depth = object.dimensions.depth / 1000;
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  return {
    width: width * cos + depth * sin,
    depth: width * sin + depth * cos,
  };
}

export function objectBounds(object) {
  const fp = footprint(object);
  return {
    minX: object.position.x - fp.width / 2,
    maxX: object.position.x + fp.width / 2,
    minZ: object.position.z - fp.depth / 2,
    maxZ: object.position.z + fp.depth / 2,
  };
}

function boundsOverlap(a, b, tolerance = 0.015) {
  return !(
    a.maxX <= b.minX + tolerance ||
    a.minX >= b.maxX - tolerance ||
    a.maxZ <= b.minZ + tolerance ||
    a.minZ >= b.maxZ - tolerance
  );
}

export function collisionWarnings(project) {
  const area = workArea(project);
  const warnings = [];
  const bounds = project.objects.map((object) => ({
    object,
    bounds: objectBounds(object),
  }));

  for (const entry of bounds) {
    const { object, bounds: item } = entry;
    if (
      item.minX < area.minX ||
      item.maxX > area.maxX ||
      item.minZ < area.minZ ||
      item.maxZ > area.maxZ
    ) {
      warnings.push({
        type: "fit",
        ids: [object.id],
        message: `${object.label} extends outside the usable room.`,
      });
    }
  }

  for (let index = 0; index < bounds.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < bounds.length; otherIndex += 1) {
      const first = bounds[index];
      const second = bounds[otherIndex];
      if (boundsOverlap(first.bounds, second.bounds)) {
        warnings.push({
          type: "collision",
          ids: [first.object.id, second.object.id],
          message: `${first.object.label} overlaps ${second.object.label}.`,
        });
      }
    }
  }

  return warnings;
}

export function clearancesForObject(project, object) {
  const area = workArea(project);
  const bounds = objectBounds(object);
  return {
    left: Math.max(0, bounds.minX - area.minX),
    right: Math.max(0, area.maxX - bounds.maxX),
    front: Math.max(0, bounds.minZ - area.minZ),
    back: Math.max(0, area.maxZ - bounds.maxZ),
  };
}

export function moveObject(project, id, nextPosition, rotation = null) {
  const object = project.objects.find((item) => item.id === id);
  if (!object) return null;
  object.position.x = Number(nextPosition.x ?? object.position.x);
  object.position.y = Number(nextPosition.y ?? object.position.y);
  object.position.z = Number(nextPosition.z ?? object.position.z);
  if (rotation !== null) object.rotation = Number(rotation);
  return object;
}

export function resizeEnsuite(project, changes, moveContents = true) {
  if (!project.ensuite) return project;
  const previous = deepClone(project.ensuite);
  const next = {
    ...project.ensuite,
    ...Object.fromEntries(
      Object.entries(changes).map(([key, value]) => [key, Number(value)]),
    ),
  };
  next.x = Math.max(
    -project.room.width / 2,
    Math.min(next.x, project.room.width / 2 - 1),
  );
  next.z = Math.max(
    -project.room.length / 2,
    Math.min(next.z, project.room.length / 2 - 1),
  );
  next.width = Math.max(
    1,
    Math.min(next.width, project.room.width / 2 - next.x),
  );
  next.depth = Math.max(
    1,
    Math.min(next.depth, project.room.length / 2 - next.z),
  );

  if (moveContents && ("x" in changes || "z" in changes)) {
    const dx = next.x - previous.x;
    const dz = next.z - previous.z;
    project.objects.forEach((object) => {
      const wasInside =
        object.position.x >= previous.x &&
        object.position.x <= previous.x + previous.width &&
        object.position.z >= previous.z &&
        object.position.z <= previous.z + previous.depth;
      if (wasInside) {
        object.position.x += dx;
        object.position.z += dz;
      }
    });
  }

  project.ensuite = next;
  return project;
}

export function remainingBedroomArea(project) {
  if (!project.ensuite) return 0;
  return Math.max(
    0,
    project.room.width * project.room.length - project.ensuite.width * project.ensuite.depth,
  );
}

function readableSlug(url) {
  try {
    const path = new URL(url).pathname;
    return decodeURIComponent(path)
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[-_/]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return String(url || "").replace(/[-_/]+/g, " ");
  }
}

export function classifyProductLink(url, extraText = "") {
  const searchText = `${readableSlug(url)} ${extraText}`.toLowerCase();
  const matches = PRODUCT_LINK_RULES.map((rule) => {
    const matched = rule.keywords.filter((keyword) => searchText.includes(keyword));
    const longest = matched.reduce((length, keyword) => Math.max(length, keyword.length), 0);
    return { rule, score: matched.length * 10 + longest };
  })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  let retailer = "";
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    retailer =
      RETAILER_RULES.find((rule) => host === rule.host || host.endsWith(`.${rule.host}`))
        ?.retailer || host;
  } catch {
    retailer = "";
  }

  return {
    family: matches[0]?.rule.family || null,
    confidence: matches.length ? Math.min(0.95, 0.52 + matches[0].score / 100) : 0,
    retailer,
    inferredName: readableSlug(url)
      .replace(/\b(product|products|bathroom|bathrooms|buy|online)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim(),
  };
}

export function parseDimensionsFromText(text = "") {
  const normalized = text.toLowerCase().replace(/,/g, "");
  const triple =
    normalized.match(
      /(?:w(?:idth)?\s*)?(\d{2,4})\s*(?:mm)?\s*[x×]\s*(?:d(?:epth)?\s*)?(\d{2,4})\s*(?:mm)?\s*[x×]\s*(?:h(?:eight)?\s*)?(\d{2,4})\s*mm/,
    ) ||
    normalized.match(
      /(\d{2,4})\s*[x×]\s*(\d{2,4})\s*[x×]\s*(\d{2,4})\s*mm/,
    );
  if (!triple) return null;
  return {
    width: Number(triple[1]),
    depth: Number(triple[2]),
    height: Number(triple[3]),
  };
}

function distance(first, second) {
  return Math.hypot(first.x - second.x, first.z - second.z);
}

function classifyDistance(metres, serviceType) {
  const thresholds =
    serviceType === "soil"
      ? [1.2, 3, 5]
      : serviceType === "extractor"
        ? [2, 4, 6]
        : [1.8, 4, 6];
  if (metres <= thresholds[0]) return "Likely straightforward";
  if (metres <= thresholds[1]) return "Possible but requires alteration";
  if (metres <= thresholds[2]) return "Survey required";
  return "Current arrangement appears impractical";
}

export function serviceAssessments(project) {
  const assessments = [];
  const soil = project.services.soil;
  const water = project.services.water;
  const extractor = project.services.extractor;

  project.objects.forEach((object) => {
    const product = PRODUCT_BY_FAMILY[object.family];
    if (!product?.service) return;
    const target = product.service === "soil" ? soil : product.service === "water" ? water : soil;
    const known = Boolean(target?.known);
    const result = known
      ? classifyDistance(distance(object.position, target), product.service)
      : "Survey required";
    assessments.push({
      objectId: object.id,
      label: object.label,
      service: product.service,
      distance: known ? distance(object.position, target) : null,
      result,
      message: known
        ? `${object.label}: indicative ${product.service} route is ${distance(
            object.position,
            target,
          ).toFixed(1)}m.`
        : `${object.label}: mark the nearest known connection or keep this for the survey.`,
    });
  });

  assessments.push({
    objectId: null,
    label: "Extractor",
    service: "extractor",
    distance: extractor.known ? distance(extractor, project.route === "newEnsuite" ? {
      x: project.ensuite.x + project.ensuite.width / 2,
      z: project.ensuite.z + project.ensuite.depth / 2,
    } : { x: 0, z: 0 }) : null,
    result: extractor.known
      ? classifyDistance(
          distance(
            extractor,
            project.route === "newEnsuite"
              ? {
                  x: project.ensuite.x + project.ensuite.width / 2,
                  z: project.ensuite.z + project.ensuite.depth / 2,
                }
              : { x: 0, z: 0 },
          ),
          "extractor",
        )
      : "Survey required",
    message: extractor.known
      ? "Indicative extractor route marked."
      : "Possible extractor termination is not yet known.",
  });

  return assessments;
}

export function overallServiceStatus(project) {
  return serviceAssessments(project).reduce(
    (worst, assessment) =>
      severityOrder[assessment.result] > severityOrder[worst] ? assessment.result : worst,
    "Likely straightforward",
  );
}

export function calculateTileQuantities(project) {
  const finishes = project.finishes;
  const area = workArea(project);
  const tiledHeight = Math.min(Number(finishes.tileHeight || area.height), area.height);
  const wallAreas = {
    north: area.width * tiledHeight,
    south: area.width * tiledHeight,
    east: area.depth * tiledHeight,
    west: area.depth * tiledHeight,
  };

  const openingsArea = project.room.openings.reduce((sum, opening) => {
    const openingArea = Number(opening.width || 0) * Number(opening.height || 0);
    if (!wallAreas[opening.wall]) return sum;
    return { ...sum, [opening.wall]: (sum[opening.wall] || 0) + openingArea };
  }, {});

  Object.keys(wallAreas).forEach((wall) => {
    wallAreas[wall] = Math.max(0, wallAreas[wall] - (openingsArea[wall] || 0));
  });

  let selectedWallArea = 0;
  if (finishes.wallSelection === "one") {
    selectedWallArea = wallAreas[finishes.selectedWall] || 0;
  } else if (finishes.wallSelection === "shower") {
    selectedWallArea = Math.min(area.width, 1.2) * Math.min(area.height, 2.1) * 2;
  } else {
    selectedWallArea = Object.values(wallAreas).reduce((sum, value) => sum + value, 0);
  }

  const floorArea = area.width * area.depth;
  const wasteFactor = 1 + Number(finishes.wastagePercent || 0) / 100;
  const wallOrderArea = selectedWallArea * wasteFactor;
  const floorOrderArea = floorArea * wasteFactor;
  const wallTileArea =
    (Number(finishes.tileWidthMm || 0) * Number(finishes.tileHeightMm || 0)) / 1_000_000;
  const floorTileArea =
    (Number(finishes.floorTileWidthMm || 0) * Number(finishes.floorTileHeightMm || 0)) /
    1_000_000;

  function priceFor(orderArea, sqmPrice, boxPrice, boxCoverage) {
    if (Number(sqmPrice) > 0) return orderArea * Number(sqmPrice);
    if (Number(boxPrice) > 0 && Number(boxCoverage) > 0) {
      return Math.ceil(orderArea / Number(boxCoverage)) * Number(boxPrice);
    }
    return 0;
  }

  return {
    wallArea: selectedWallArea,
    wallOrderArea,
    wallTiles: wallTileArea > 0 ? Math.ceil(wallOrderArea / wallTileArea) : 0,
    wallBoxes:
      Number(finishes.wallTileBoxCoverage) > 0
        ? Math.ceil(wallOrderArea / Number(finishes.wallTileBoxCoverage))
        : null,
    floorArea,
    floorOrderArea,
    floorTiles: floorTileArea > 0 ? Math.ceil(floorOrderArea / floorTileArea) : 0,
    floorBoxes:
      Number(finishes.floorTileBoxCoverage) > 0
        ? Math.ceil(floorOrderArea / Number(finishes.floorTileBoxCoverage))
        : null,
    price:
      priceFor(
        wallOrderArea,
        finishes.wallTilePricePerSqm,
        finishes.wallTilePricePerBox,
        finishes.wallTileBoxCoverage,
      ) +
      priceFor(
        floorOrderArea,
        finishes.floorTilePricePerSqm,
        finishes.floorTilePricePerBox,
        finishes.floorTileBoxCoverage,
      ),
  };
}

export function calculateEstimate(project) {
  const route = PRICING_CONFIG.routes[project.route];
  const serviceStatus = overallServiceStatus(project);
  const serviceMultiplier = PRICING_CONFIG.serviceMultipliers[serviceStatus] || 1;
  const tile = calculateTileQuantities(project);
  const confirmedProducts = project.objects.reduce(
    (sum, object) => sum + (Number(object.price) > 0 ? Number(object.price) : 0),
    0,
  );
  const unpricedProducts = project.objects.filter((object) => !(Number(object.price) > 0)).length;

  const sections = Object.fromEntries(
    ESTIMATE_SECTIONS.map((section) => [
      section.id,
      {
        ...section,
        minimum: 0,
        maximum: 0,
        surveyDependent: false,
        notes: [],
      },
    ]),
  );
  sections.products.minimum = confirmedProducts;
  sections.products.maximum = confirmedProducts;
  sections.products.notes.push(
    confirmedProducts
      ? "Customer-entered or imported displayed prices."
      : "Add displayed prices to confirm product spend.",
  );
  if (unpricedProducts) {
    sections.products.notes.push(`${unpricedProducts} product price${unpricedProducts === 1 ? "" : "s"} not confirmed.`);
    sections.unconfirmed.surveyDependent = true;
  }

  if (route.minimum !== null) {
    Object.entries(route.distribution).forEach(([id, share]) => {
      if (!sections[id] || id === "products") return;
      const plumbingFactor = id === "plumbing" ? serviceMultiplier : 1;
      sections[id].minimum = route.minimum * share * plumbingFactor;
      sections[id].maximum =
        route.maximum !== null ? route.maximum * share * plumbingFactor : null;
    });
    sections.plumbing.notes.push(`Indicative route: ${serviceStatus}.`);
    sections.unconfirmed.surveyDependent = true;
    sections.unconfirmed.notes.push("Measurements and concealed services require a home survey.");
  } else {
    Object.values(sections).forEach((section) => {
      if (!["products", "tiling"].includes(section.id)) section.surveyDependent = true;
    });
    sections.unconfirmed.notes.push("The published cloakroom guide requires a survey.");
  }

  if (tile.price > 0) {
    sections.tiling.minimum += tile.price;
    if (sections.tiling.maximum !== null) sections.tiling.maximum += tile.price;
    sections.tiling.notes.push("Includes customer-entered tile prices.");
  }

  const numericSections = Object.values(sections);
  const minimum =
    numericSections.reduce((sum, section) => sum + Number(section.minimum || 0), 0);
  const maximum =
    route.maximum === null
      ? null
      : numericSections.reduce((sum, section) => sum + Number(section.maximum || 0), 0);

  return {
    route,
    sections,
    minimum,
    maximum,
    publishedGuide: route.publishedGuide,
    serviceStatus,
    tile,
    confirmedProducts,
    unpricedProducts,
    isSurveyDependent: true,
  };
}

export function saveProject(project, storage = globalThis.localStorage) {
  const value = {
    ...deepClone(project),
    version: PROJECT_VERSION,
    updatedAt: new Date().toISOString(),
  };
  storage.setItem(STORAGE_KEY, JSON.stringify(value));
  return value;
}

export function restoreProject(storage = globalThis.localStorage) {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.version !== PROJECT_VERSION || !parsed.route || !Array.isArray(parsed.objects)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearSavedProject(storage = globalThis.localStorage) {
  storage.removeItem(STORAGE_KEY);
}

export function prepareProjectPayload(project) {
  const estimate = calculateEstimate(project);
  return {
    schema: "en-suites-estimator-draft-1",
    createdAt: new Date().toISOString(),
    customer: deepClone(project.customer),
    route: project.route,
    room: deepClone(project.room),
    ensuite: deepClone(project.ensuite),
    services: deepClone(project.services),
    products: deepClone(project.objects),
    finishes: deepClone(project.finishes),
    estimate: {
      publishedGuide: estimate.publishedGuide,
      minimum: estimate.minimum,
      maximum: estimate.maximum,
      serviceStatus: estimate.serviceStatus,
      sections: estimate.sections,
    },
    warnings: collisionWarnings(project),
    disclaimer:
      "Early budget guide only. Measurements, service routes and selected products must be verified during a home survey before a final quotation.",
  };
}
