import {
  addProduct,
  calculateEstimate,
  calculateTileQuantities,
  classifyProductLink,
  clearSavedProject,
  clearancesForObject,
  collisionWarnings,
  createDefaultProject,
  deepClone,
  makeObject,
  moveObject,
  parseDimensionsFromText,
  prepareProjectPayload,
  remainingBedroomArea,
  resizeEnsuite,
  restoreProject,
  saveProject,
  serviceAssessments,
  swapProductFamily,
  workArea,
} from "./estimator-core.mjs";
import {
  PRODUCT_BY_FAMILY,
  PRODUCT_CATEGORIES,
  PRODUCTS,
} from "../data/estimator-products.mjs";
import { ESTIMATE_SECTIONS } from "../data/estimator-pricing.mjs";
import { Bathroom3DEngine } from "./estimator-3d.mjs";

const STAGES = [
  { id: "room", label: "Room" },
  { id: "layout", label: "Layout" },
  { id: "products", label: "Products" },
  { id: "tiles", label: "Tiles" },
  { id: "finishing", label: "Finishing touches" },
  { id: "estimate", label: "Estimate" },
];

const routeLabels = {
  existing: "Existing bathroom or en-suite",
  newEnsuite: "Brand-new en-suite",
  cloakroom: "Cloakroom",
};

const dom = {
  routeGate: document.querySelector("#routeGate"),
  resumeBox: document.querySelector("#resumeBox"),
  resumeSummary: document.querySelector("#resumeSummary"),
  resumeButton: document.querySelector("#resumeProject"),
  discardButton: document.querySelector("#discardSaved"),
  stageTabs: document.querySelector("#stageTabs"),
  stagePanel: document.querySelector("#stagePanel"),
  selectionInspector: document.querySelector("#selectionInspector"),
  estimatePanel: document.querySelector("#estimatePanel"),
  estimateToggle: document.querySelector("#estimateToggle"),
  estimateClose: document.querySelector("#estimateClose"),
  warningPanel: document.querySelector("#warningPanel"),
  saveStatus: document.querySelector("#saveStatus"),
  canvas: document.querySelector("#estimatorCanvas"),
  empty3d: document.querySelector("#webglFallback"),
  undo: document.querySelector("#undoAction"),
  redo: document.querySelector("#redoAction"),
  delete: document.querySelector("#deleteAction"),
  reset: document.querySelector("#resetAction"),
  back: document.querySelector("#stageBack"),
  next: document.querySelector("#stageNext"),
  currentStage: document.querySelector("#currentStageName"),
  wallFade: document.querySelector("#wallFade"),
  walkPad: document.querySelector("#walkPad"),
  toast: document.querySelector("#estimatorToast"),
};

let project = createDefaultProject("existing");
let savedProject = restoreProject();
let currentStage = 0;
let selectedId = null;
let history = [];
let future = [];
let transformBaseline = null;
let saveTimer = null;
let importDraft = null;
let engine = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMoney(value, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits,
  }).format(Number(value || 0));
}

function formatMetres(value) {
  return `${Number(value || 0).toFixed(2)}m`;
}

function getPath(object, path) {
  return path.split(".").reduce((current, key) => current?.[key], object);
}

function setPath(object, path, value) {
  const keys = path.split(".");
  const finalKey = keys.pop();
  const target = keys.reduce((current, key) => current[key], object);
  target[finalKey] = value;
}

function showToast(message) {
  dom.toast.textContent = message;
  dom.toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => dom.toast.classList.remove("is-visible"), 2200);
}

function snapshot() {
  return deepClone(project);
}

function commitChange(mutator, options = {}) {
  const before = snapshot();
  mutator();
  history.push(before);
  if (history.length > 60) history.shift();
  future = [];
  refresh({ render3d: options.render3d !== false });
}

function scheduleSave() {
  dom.saveStatus.textContent = "Saving…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    project = saveProject(project);
    dom.saveStatus.textContent = "Saved on this device";
  }, 260);
}

function refresh({ render3d = true } = {}) {
  renderStageTabs();
  renderStage();
  renderInspector();
  renderWarnings();
  renderEstimate();
  updateToolbar();
  if (render3d) engine?.renderProject(project);
  else engine?.updateWarnings(collisionWarnings(project));
  scheduleSave();
}

function startRoute(route) {
  project = createDefaultProject(route);
  history = [];
  future = [];
  selectedId = null;
  currentStage = 0;
  dom.routeGate.classList.add("is-hidden");
  refresh();
  engine?.setView("3d");
  showToast(`${routeLabels[route]} starter layout created`);
}

function renderResume() {
  if (!savedProject) {
    dom.resumeBox.hidden = true;
    return;
  }
  dom.resumeBox.hidden = false;
  dom.resumeSummary.textContent = `${routeLabels[savedProject.route]} · saved ${new Date(
    savedProject.updatedAt,
  ).toLocaleString("en-GB")}`;
}

function renderStageTabs() {
  dom.stageTabs.innerHTML = STAGES.map(
    (stage, index) => `
      <button class="estimator-stage-tab ${index === currentStage ? "is-active" : ""} ${
        index < currentStage ? "is-complete" : ""
      }" type="button" data-stage="${index}" aria-current="${index === currentStage ? "step" : "false"}">
        <span>${index + 1}</span>
        <strong>${stage.label}</strong>
      </button>
    `,
  ).join("");
  dom.currentStage.textContent = `Step ${currentStage + 1} of ${STAGES.length}: ${
    STAGES[currentStage].label
  }`;
  dom.back.disabled = currentStage === 0;
  dom.next.hidden = currentStage === STAGES.length - 1;
  dom.next.textContent = currentStage === STAGES.length - 2 ? "Review estimate" : "Next step";
}

function routeExplanation() {
  if (project.route === "newEnsuite") {
    return "Start with the full bedroom, loft or cupboard. The gold rectangle is the proposed en-suite and can be moved or resized.";
  }
  if (project.route === "cloakroom") {
    return "A compact starter layout is ready. Measure the real space and keep drainage questions marked “I’m not sure” when needed.";
  }
  return "Measure the existing room first. The starter fittings can be moved, swapped or deleted.";
}

function openingRows() {
  return project.room.openings
    .map(
      (opening) => `
        <article class="compact-card opening-row" data-opening-id="${opening.id}">
          <div class="compact-card-heading">
            <strong>${opening.type === "door" ? "Door" : "Window"}</strong>
            <button class="text-button danger" type="button" data-action="remove-opening" data-id="${opening.id}">Remove</button>
          </div>
          <div class="form-grid form-grid-2">
            <label>Wall
              <select data-opening="${opening.id}" data-key="wall">
                ${["north", "east", "south", "west"]
                  .map(
                    (side) =>
                      `<option value="${side}" ${opening.wall === side ? "selected" : ""}>${side[0].toUpperCase()}${side.slice(1)}</option>`,
                  )
                  .join("")}
              </select>
            </label>
            <label>Position from centre (m)
              <input type="number" step="0.05" data-opening="${opening.id}" data-key="offset" value="${opening.offset}">
            </label>
            <label>Width (m)
              <input type="number" min="0.3" max="3" step="0.01" data-opening="${opening.id}" data-key="width" value="${opening.width}">
            </label>
            <label>${opening.type === "window" ? "Sill height" : "Height"} (m)
              <input type="number" min="0" max="3" step="0.01" data-opening="${opening.id}" data-key="${
                opening.type === "window" ? "sillHeight" : "height"
              }" value="${opening.type === "window" ? opening.sillHeight : opening.height}">
            </label>
            ${
              opening.type === "door"
                ? `<label>Opening direction
                    <select data-opening="${opening.id}" data-key="opening">
                      ${[
                        ["inward-left", "Inward — left"],
                        ["inward-right", "Inward — right"],
                        ["outward-left", "Outward — left"],
                        ["outward-right", "Outward — right"],
                        ["sliding", "Sliding"],
                        ["pocket", "Pocket door"],
                      ]
                        .map(
                          ([value, label]) =>
                            `<option value="${value}" ${opening.opening === value ? "selected" : ""}>${label}</option>`,
                        )
                        .join("")}
                    </select>
                  </label>`
                : `<label>Window height (m)
                    <input type="number" min="0.2" max="2.5" step="0.01" data-opening="${opening.id}" data-key="height" value="${opening.height}">
                  </label>`
            }
          </div>
        </article>
      `,
    )
    .join("");
}

function roomStage() {
  return `
    <div class="panel-heading">
      <p class="panel-kicker">Start with the space you have</p>
      <h2>Measure the real room</h2>
      <p>${routeExplanation()}</p>
    </div>
    <div class="route-chip-row">
      ${Object.entries(routeLabels)
        .map(
          ([route, label]) =>
            `<button type="button" class="route-chip ${project.route === route ? "is-active" : ""}" data-action="change-route" data-route="${route}">${label}</button>`,
        )
        .join("")}
    </div>
    <section class="form-section">
      <h3>${project.route === "newEnsuite" ? "Outer room dimensions" : "Room dimensions"}</h3>
      <div class="form-grid form-grid-3">
        ${numberField("Length", "room.length", project.room.length, 1, 12, 0.05, "m")}
        ${numberField("Width", "room.width", project.room.width, 1, 12, 0.05, "m")}
        ${numberField("Ceiling height", "room.height", project.room.height, 1.8, 5, 0.05, "m")}
      </div>
      <p class="form-hint">Use the inside finished dimensions. Exact site measurements will still be checked at survey.</p>
    </section>
    <section class="form-section">
      <div class="section-title-row">
        <div>
          <h3>Doors and windows</h3>
          <p>Add the openings that affect the usable walls.</p>
        </div>
        <div class="small-actions">
          <button class="secondary-button" type="button" data-action="add-opening" data-type="door">+ Door</button>
          <button class="secondary-button" type="button" data-action="add-opening" data-type="window">+ Window</button>
        </div>
      </div>
      <div class="stack">${openingRows()}</div>
    </section>
    <section class="form-section">
      <h3>Roof and fixed features</h3>
      <label class="switch-row">
        <input type="checkbox" data-bind="room.features.rooflight" ${
          project.room.features.rooflight ? "checked" : ""
        }>
        <span><strong>There is a rooflight</strong><small>Add its approximate position with the Rooflight object in Products.</small></span>
      </label>
      <label class="switch-row">
        <input type="checkbox" data-bind="room.features.slope.enabled" ${
          project.room.features.slope.enabled ? "checked" : ""
        }>
        <span><strong>Sloping ceiling / eaves</strong><small>Draft One shows one adjustable slope on the north side.</small></span>
      </label>
      ${
        project.room.features.slope.enabled
          ? `<div class="form-grid form-grid-2 inset-fields">
              ${numberField("Low point height", "room.features.slope.startHeight", project.room.features.slope.startHeight, 0.5, project.room.height, 0.05, "m")}
              ${numberField("Slope depth", "room.features.slope.depth", project.room.features.slope.depth, 0.2, 3, 0.05, "m")}
            </div>`
          : ""
      }
      <button class="secondary-button" type="button" data-action="add-family" data-family="fixed-obstruction">+ Add chimney, cupboard or obstruction</button>
    </section>
  `;
}

function numberField(label, path, value, min, max, step, suffix = "") {
  return `
    <label>${label}
      <span class="input-with-suffix">
        <input type="number" min="${min}" max="${max}" step="${step}" value="${value}" data-bind="${path}" data-number="true">
        ${suffix ? `<span>${suffix}</span>` : ""}
      </span>
    </label>
  `;
}

function technicalPosition(kind, label, description) {
  const service = project.services[kind];
  return `
    <article class="technical-card ${service.known ? "is-known" : "is-unknown"}">
      <div>
        <strong>${label}</strong>
        <p>${description}</p>
      </div>
      <div class="technical-choice">
        <button type="button" class="${!service.known ? "is-active" : ""}" data-action="service-known" data-service="${kind}" data-known="false">I’m not sure</button>
        <button type="button" class="${service.known ? "is-active" : ""}" data-action="service-known" data-service="${kind}" data-known="true">Mark approximate</button>
      </div>
      ${
        service.known
          ? `<div class="form-grid form-grid-2">
              ${numberField("Across room (X)", `services.${kind}.x`, service.x, -12, 12, 0.05, "m")}
              ${numberField("Along room (Z)", `services.${kind}.z`, service.z, -12, 12, 0.05, "m")}
            </div>`
          : ""
      }
    </article>
  `;
}

function ensuiteFields() {
  if (project.route !== "newEnsuite") return "";
  const zone = project.ensuite;
  return `
    <section class="form-section featured-section">
      <div class="section-title-row">
        <div>
          <p class="panel-kicker">Room within a room</p>
          <h3>Proposed en-suite</h3>
          <p>Drag the gold floor in 3D or enter exact values. Fittings move with the enclosure.</p>
        </div>
        <strong class="area-badge">${remainingBedroomArea(project).toFixed(1)}m² bedroom remaining</strong>
      </div>
      <div class="form-grid form-grid-3">
        ${numberField("Position X", "ensuite.x", zone.x, -6, 6, 0.05, "m")}
        ${numberField("Position Z", "ensuite.z", zone.z, -6, 6, 0.05, "m")}
        ${numberField("Width", "ensuite.width", zone.width, 1, project.room.width, 0.05, "m")}
        ${numberField("Depth", "ensuite.depth", zone.depth, 1, project.room.length, 0.05, "m")}
        ${numberField("Partition height", "ensuite.height", zone.height, 1.8, project.room.height, 0.05, "m")}
        ${numberField("Wall thickness", "ensuite.wallThickness", zone.wallThickness, 0.05, 0.3, 0.01, "m")}
      </div>
      <div class="form-grid form-grid-3">
        <label>En-suite door
          <select data-bind="ensuite.door.type">
            ${[
              ["inward", "Inward-opening"],
              ["outward", "Outward-opening"],
              ["sliding", "Sliding"],
              ["pocket", "Pocket door"],
            ]
              .map(
                ([value, label]) =>
                  `<option value="${value}" ${zone.door.type === value ? "selected" : ""}>${label}</option>`,
              )
              .join("")}
          </select>
        </label>
        ${numberField("Door width", "ensuite.door.width", zone.door.width, 0.6, 1.2, 0.01, "m")}
        ${numberField("Door position", "ensuite.door.offset", zone.door.offset, 0, zone.width, 0.05, "m")}
      </div>
      <p class="form-hint">The project data stores individual partition segments so non-rectangular layouts can be added later without replacing the 3D engine.</p>
    </section>
  `;
}

function layoutStage() {
  const assessments = serviceAssessments(project);
  return `
    <div class="panel-heading">
      <p class="panel-kicker">Position the room and known services</p>
      <h2>Shape a practical layout</h2>
      <p>Approximate positions are useful. Choose “I’m not sure” whenever the route is concealed or unknown.</p>
    </div>
    ${ensuiteFields()}
    <section class="form-section">
      <h3>Waste, water and ventilation</h3>
      <div class="technical-stack">
        ${technicalPosition("soil", "Toilet waste / soil connection", "Existing stack or the best known connection point.")}
        ${technicalPosition("water", "Hot and cold water supply", "Nearest visible or likely supply point.")}
        ${technicalPosition("extractor", "Possible extractor route", "External wall, roof outlet or known duct route.")}
      </div>
      <article class="technical-card ${
        project.services.nearestBathroom.known ? "is-known" : "is-unknown"
      }">
        <div><strong>Nearest existing WC or bathroom</strong><p>This helps the early route conversation; it does not prove a connection.</p></div>
        <div class="technical-choice">
          <button type="button" class="${
            !project.services.nearestBathroom.known ? "is-active" : ""
          }" data-action="nearest-known" data-known="false">I’m not sure</button>
          <button type="button" class="${
            project.services.nearestBathroom.known ? "is-active" : ""
          }" data-action="nearest-known" data-known="true">I can estimate it</button>
        </div>
        ${
          project.services.nearestBathroom.known
            ? `<div class="form-grid form-grid-2">
                ${numberField("Approximate distance", "services.nearestBathroom.distance", project.services.nearestBathroom.distance || 0, 0, 30, 0.1, "m")}
                <label>Direction
                  <select data-bind="services.nearestBathroom.direction">
                    ${["same wall", "next room", "floor below", "floor above", "unknown"]
                      .map(
                        (value) =>
                          `<option ${project.services.nearestBathroom.direction === value ? "selected" : ""}>${value}</option>`,
                      )
                      .join("")}
                  </select>
                </label>
              </div>`
            : ""
        }
      </article>
      <div class="form-grid form-grid-2">
        <label>Floor construction
          <select data-bind="services.floorConstruction">
            ${["unknown", "timber", "concrete"]
              .map(
                (value) =>
                  `<option value="${value}" ${project.services.floorConstruction === value ? "selected" : ""}>${
                    value === "unknown" ? "I’m not sure" : value[0].toUpperCase() + value.slice(1)
                  }</option>`,
              )
              .join("")}
          </select>
        </label>
        <label>Joist direction
          <select data-bind="services.joistDirection">
            ${[
              ["unknown", "I’m not sure"],
              ["north-south", "North to south"],
              ["east-west", "East to west"],
            ]
              .map(
                ([value, label]) =>
                  `<option value="${value}" ${project.services.joistDirection === value ? "selected" : ""}>${label}</option>`,
              )
              .join("")}
          </select>
        </label>
      </div>
    </section>
    <section class="form-section">
      <div class="section-title-row">
        <div><h3>Early service indication</h3><p>Lines in the 3D view are indicative straight-line routes only.</p></div>
        <span class="status-pill status-${calculateEstimate(project).serviceStatus
          .toLowerCase()
          .replaceAll(" ", "-")}">${calculateEstimate(project).serviceStatus}</span>
      </div>
      <div class="assessment-list">
        ${assessments
          .map(
            (assessment) => `
              <div><span class="assessment-dot"></span><p><strong>${assessment.result}</strong><small>${assessment.message}</small></p></div>
            `,
          )
          .join("")}
      </div>
      <p class="plain-warning"><strong>Planning indication only.</strong> This does not discover concealed drainage, approve building regulations or guarantee installation viability.</p>
    </section>
  `;
}

function productCard(product) {
  return `
    <article class="catalogue-card" draggable="true" data-family="${product.family}">
      <div class="catalogue-model model-${product.modelKind}">
        <span></span>
      </div>
      <div>
        <strong>${product.label}</strong>
        <small>${product.dimensions.width} × ${product.dimensions.depth} × ${product.dimensions.height}mm</small>
      </div>
      <button type="button" data-action="add-family" data-family="${product.family}" aria-label="Add ${product.label}">Add</button>
    </article>
  `;
}

function importForm() {
  const draft = importDraft;
  return `
    <details class="import-card" ${draft ? "open" : ""}>
      <summary>
        <span><i class="fa-solid fa-link"></i><strong>Add a product link</strong></span>
        <small>We map it to the closest generic 3D family.</small>
      </summary>
      <div class="import-body">
        <div class="url-row">
          <label class="sr-only" for="productUrl">Product page URL</label>
          <input id="productUrl" type="url" placeholder="Paste a retailer product link" value="${escapeHtml(
            draft?.url || "",
          )}">
          <button class="primary-button" type="button" data-action="inspect-link">Read link</button>
        </div>
        <p id="importStatus" class="form-hint">${
          draft
            ? escapeHtml(draft.status)
            : "Public metadata will be read where the retailer permits it. Missing details stay blank."
        }</p>
        ${
          draft
            ? `<div class="form-grid form-grid-2 import-fields">
                <label>Internal model family
                  <select id="importFamily">
                    <option value="">Choose a family</option>
                    ${PRODUCTS.map(
                      (product) =>
                        `<option value="${product.family}" ${draft.family === product.family ? "selected" : ""}>${product.label}</option>`,
                    ).join("")}
                  </select>
                </label>
                <label>Product name
                  <input id="importName" value="${escapeHtml(draft.name)}" placeholder="Required if the page could not be read">
                </label>
                <label>Retailer
                  <input id="importRetailer" value="${escapeHtml(draft.retailer)}">
                </label>
                <label>Displayed price (£)
                  <input id="importPrice" type="number" min="0" step="0.01" value="${draft.price ?? ""}" placeholder="Enter if missing">
                </label>
                <label>Width (mm)
                  <input id="importWidth" type="number" min="20" value="${draft.dimensions?.width ?? ""}">
                </label>
                <label>Depth (mm)
                  <input id="importDepth" type="number" min="20" value="${draft.dimensions?.depth ?? ""}">
                </label>
                <label>Height (mm)
                  <input id="importHeight" type="number" min="20" value="${draft.dimensions?.height ?? ""}">
                </label>
                <label>Finish / colour
                  <input id="importFinish" value="${escapeHtml(draft.finish || "")}" placeholder="e.g. brushed brass">
                </label>
                <label class="full-field">Product image URL
                  <input id="importImage" type="url" value="${escapeHtml(draft.image || "")}">
                </label>
              </div>
              <div class="import-result">
                <span class="confidence">${Math.round((draft.confidence || 0) * 100)}% mapping confidence</span>
                <p>${draft.missing.length ? `<strong>Still needed:</strong> ${draft.missing.join(", ")}` : "Core product details are complete."}</p>
              </div>
              <button class="primary-button full-button" type="button" data-action="add-imported">Add mapped product</button>`
            : ""
        }
      </div>
    </details>
  `;
}

function productsStage() {
  return `
    <div class="panel-heading">
      <p class="panel-kicker">Drag, drop or tap Add</p>
      <h2>Choose products</h2>
      <p>These clean generic models can later be replaced by detailed assets without changing the saved project format.</p>
    </div>
    ${importForm()}
    <div class="catalogue-filter" role="group" aria-label="Filter product catalogue">
      <button type="button" class="is-active" data-filter="all">All</button>
      ${PRODUCT_CATEGORIES.map(
        (category) =>
          `<button type="button" data-filter="${category.id}">${category.label}</button>`,
      ).join("")}
    </div>
    <div class="catalogue-grid">
      ${PRODUCTS.map(productCard).join("")}
    </div>
    <p class="form-hint mobile-drag-hint">On a phone or tablet, use the Add button, then move the product with the 3D arrows or exact-position fields.</p>
  `;
}

function tilesStage() {
  const quantity = calculateTileQuantities(project);
  const finish = project.finishes;
  return `
    <div class="panel-heading">
      <p class="panel-kicker">Walls, floor and quantities</p>
      <h2>Choose tiles</h2>
      <p>Select a coverage area, enter the tile details and see quantity with wastage immediately.</p>
    </div>
    <section class="form-section">
      <h3>Wall coverage</h3>
      <div class="segmented-control">
        ${[
          ["all", "Every wall"],
          ["one", "One wall"],
          ["shower", "Shower area"],
        ]
          .map(
            ([value, label]) =>
              `<button type="button" data-action="tile-selection" data-value="${value}" class="${
                finish.wallSelection === value ? "is-active" : ""
              }">${label}</button>`,
          )
          .join("")}
      </div>
      ${
        finish.wallSelection === "one"
          ? `<label>Selected wall
              <select data-bind="finishes.selectedWall">
                ${["north", "east", "south", "west"]
                  .map(
                    (wall) =>
                      `<option value="${wall}" ${finish.selectedWall === wall ? "selected" : ""}>${wall[0].toUpperCase()}${wall.slice(1)}</option>`,
                  )
                  .join("")}
              </select>
            </label>`
          : ""
      }
      <div class="form-grid form-grid-3">
        ${numberField("Tile up to", "finishes.tileHeight", finish.tileHeight, 0.1, workArea(project).height, 0.05, "m")}
        ${numberField("Tile width", "finishes.tileWidthMm", finish.tileWidthMm, 20, 2000, 1, "mm")}
        ${numberField("Tile height", "finishes.tileHeightMm", finish.tileHeightMm, 20, 3000, 1, "mm")}
      </div>
      <div class="form-grid form-grid-3">
        ${numberField("Price per m²", "finishes.wallTilePricePerSqm", finish.wallTilePricePerSqm ?? "", 0, 1000, 0.01, "£")}
        ${numberField("Or price per box", "finishes.wallTilePricePerBox", finish.wallTilePricePerBox ?? "", 0, 1000, 0.01, "£")}
        ${numberField("Box coverage", "finishes.wallTileBoxCoverage", finish.wallTileBoxCoverage ?? "", 0, 20, 0.01, "m²")}
      </div>
      <label>Tile product link
        <input type="url" data-bind="finishes.wallTileLink" value="${escapeHtml(
          finish.wallTileLink,
        )}" placeholder="Paste the retailer page">
      </label>
      <label>Direct tile image URL <small>(optional indicative material)</small>
        <input type="url" data-bind="finishes.wallTileImage" value="${escapeHtml(
          finish.wallTileImage,
        )}" placeholder="Use an image URL that permits public loading">
      </label>
    </section>
    <section class="form-section">
      <h3>Floor tiles</h3>
      <div class="form-grid form-grid-3">
        ${numberField("Tile width", "finishes.floorTileWidthMm", finish.floorTileWidthMm, 20, 2000, 1, "mm")}
        ${numberField("Tile height", "finishes.floorTileHeightMm", finish.floorTileHeightMm, 20, 3000, 1, "mm")}
        ${numberField("Wastage", "finishes.wastagePercent", finish.wastagePercent, 0, 30, 1, "%")}
        ${numberField("Price per m²", "finishes.floorTilePricePerSqm", finish.floorTilePricePerSqm ?? "", 0, 1000, 0.01, "£")}
        ${numberField("Or price per box", "finishes.floorTilePricePerBox", finish.floorTilePricePerBox ?? "", 0, 1000, 0.01, "£")}
        ${numberField("Box coverage", "finishes.floorTileBoxCoverage", finish.floorTileBoxCoverage ?? "", 0, 20, 0.01, "m²")}
      </div>
      <label>Floor tile product link
        <input type="url" data-bind="finishes.floorTileLink" value="${escapeHtml(
          finish.floorTileLink,
        )}">
      </label>
    </section>
    <section class="quantity-card">
      <div><small>Wall tile area</small><strong>${quantity.wallArea.toFixed(1)}m²</strong><span>${quantity.wallOrderArea.toFixed(1)}m² incl. wastage · ${quantity.wallTiles} tiles${
        quantity.wallBoxes ? ` · ${quantity.wallBoxes} boxes` : ""
      }</span></div>
      <div><small>Floor tile area</small><strong>${quantity.floorArea.toFixed(1)}m²</strong><span>${quantity.floorOrderArea.toFixed(1)}m² incl. wastage · ${quantity.floorTiles} tiles${
        quantity.floorBoxes ? ` · ${quantity.floorBoxes} boxes` : ""
      }</span></div>
      <div><small>Entered tile cost</small><strong>${formatMoney(quantity.price)}</strong><span>Only prices you entered are included.</span></div>
    </section>
    <p class="plain-warning"><strong>Visual guide:</strong> online tile imagery is indicative. Real colour, shade, scale and veining vary between screens, samples and batches.</p>
  `;
}

function finishingStage() {
  const finish = project.finishes;
  return `
    <div class="panel-heading">
      <p class="panel-kicker">Bring the room together</p>
      <h2>Finishing touches</h2>
      <p>Adjust the simple finishes and add the last practical pieces.</p>
    </div>
    <section class="form-section">
      <h3>Colours and laying direction</h3>
      <div class="form-grid form-grid-2">
        <label>Grout colour
          <span class="colour-control"><input type="color" data-bind="finishes.groutColour" value="${finish.groutColour}"><input data-bind="finishes.groutColour" value="${finish.groutColour}"></span>
        </label>
        <label>Laying direction
          <select data-bind="finishes.layingDirection">
            ${[
              ["straight", "Straight / grid"],
              ["vertical", "Vertical"],
              ["brick", "Brick bond"],
              ["herringbone", "Herringbone guide"],
            ]
              .map(
                ([value, label]) =>
                  `<option value="${value}" ${finish.layingDirection === value ? "selected" : ""}>${label}</option>`,
              )
              .join("")}
          </select>
        </label>
        <label>Wall colour
          <span class="colour-control"><input type="color" data-bind="finishes.wallColour" value="${finish.wallColour}"><input data-bind="finishes.wallColour" value="${finish.wallColour}"></span>
        </label>
        <label>Floor colour
          <span class="colour-control"><input type="color" data-bind="finishes.floorColour" value="${finish.floorColour}"><input data-bind="finishes.floorColour" value="${finish.floorColour}"></span>
        </label>
      </div>
    </section>
    <section class="form-section">
      <h3>Quick add</h3>
      <div class="quick-add-grid">
        ${["heated-towel-rail", "mirror", "basin-tap", "concealed-shower", "exposed-shower"]
          .map(
            (family) =>
              `<button type="button" data-action="add-family" data-family="${family}"><span>+</span>${PRODUCT_BY_FAMILY[family].label}</button>`,
          )
          .join("")}
      </div>
    </section>
    <section class="form-section">
      <h3>Review clearances</h3>
      <p>Select any product in 3D to see exact wall clearances and dimensions in the inspector below the canvas.</p>
      <button class="secondary-button" type="button" data-stage-jump="2">Return to product layout</button>
    </section>
  `;
}

function estimateStage() {
  const estimate = calculateEstimate(project);
  const payload = prepareProjectPayload(project);
  return `
    <div class="panel-heading">
      <p class="panel-kicker">Early budget and survey brief</p>
      <h2>Review your estimate</h2>
      <p>This is an itemised early budget guide, not a fixed quotation.</p>
    </div>
    <section class="review-hero">
      <div><small>Published guide</small><strong>${estimate.publishedGuide}</strong><span>${routeLabels[project.route]}</span></div>
      <div><small>Room</small><strong>${project.room.width.toFixed(2)} × ${project.room.length.toFixed(2)}m</strong><span>${project.objects.length} placed products</span></div>
      <div><small>Services</small><strong>${estimate.serviceStatus}</strong><span>${collisionWarnings(project).length} fit warning${collisionWarnings(project).length === 1 ? "" : "s"}</span></div>
    </section>
    <section class="form-section">
      <h3>Your survey brief</h3>
      <p>These details are saved only on this device. They are included in the exported project file and WhatsApp summary.</p>
      <div class="form-grid form-grid-2">
        <label>Name<input data-bind="customer.name" value="${escapeHtml(project.customer.name)}"></label>
        <label>Telephone<input type="tel" data-bind="customer.telephone" value="${escapeHtml(project.customer.telephone)}"></label>
        <label>Email<input type="email" data-bind="customer.email" value="${escapeHtml(project.customer.email)}"></label>
        <label>Project notes<input data-bind="notes" value="${escapeHtml(project.notes)}" placeholder="Timing, access or priorities"></label>
      </div>
    </section>
    <section class="form-section">
      <h3>Prepare the project</h3>
      <div class="handoff-actions">
        <button class="primary-button" type="button" data-action="download-project"><i class="fa-solid fa-download"></i> Download project data</button>
        <button class="secondary-button" type="button" data-action="copy-summary"><i class="fa-regular fa-copy"></i> Copy survey summary</button>
        <button class="whatsapp-button" type="button" data-action="whatsapp-project"><i class="fa-brands fa-whatsapp"></i> Prepare WhatsApp enquiry</button>
      </div>
      <p class="form-hint">The structured JSON file is ready for a future lead/dashboard endpoint without changing the estimator’s project format.</p>
    </section>
    <details class="project-data-preview">
      <summary>Preview saved project data</summary>
      <pre>${escapeHtml(JSON.stringify(payload, null, 2))}</pre>
    </details>
    <p class="estimate-disclaimer"><strong>Before a final quotation:</strong> measurements, structure, service routes, electrical work, ventilation, product suitability and finishes must be verified during a home survey.</p>
  `;
}

function renderStage() {
  const stage = STAGES[currentStage].id;
  const markup =
    stage === "room"
      ? roomStage()
      : stage === "layout"
        ? layoutStage()
        : stage === "products"
          ? productsStage()
          : stage === "tiles"
            ? tilesStage()
            : stage === "finishing"
              ? finishingStage()
              : estimateStage();
  dom.stagePanel.innerHTML = markup;
  if (stage === "products") bindCatalogueDrag();
}

function renderInspector() {
  if (!selectedId) {
    dom.selectionInspector.innerHTML = `
      <div class="inspector-empty">
        <i class="fa-solid fa-arrow-pointer"></i>
        <div><strong>Select something in 3D</strong><p>Tap a product for exact position, size, rotation, swap and delete controls.</p></div>
      </div>
    `;
    return;
  }

  if (selectedId === "__ensuite__" && project.ensuite) {
    const zone = project.ensuite;
    dom.selectionInspector.innerHTML = `
      <div class="inspector-heading"><div><small>Selected room</small><strong>Proposed en-suite</strong></div><span>${(zone.width * zone.depth).toFixed(1)}m²</span></div>
      <div class="inspector-grid">
        ${inspectorNumber("X", "x", zone.x * 1000, "ensuite")}
        ${inspectorNumber("Z", "z", zone.z * 1000, "ensuite")}
        ${inspectorNumber("Width", "width", zone.width * 1000, "ensuite")}
        ${inspectorNumber("Depth", "depth", zone.depth * 1000, "ensuite")}
      </div>
      <p class="form-hint">Values are millimetres. Products inside move with the enclosure.</p>
    `;
    return;
  }

  const object = project.objects.find((item) => item.id === selectedId);
  if (!object) {
    selectedId = null;
    renderInspector();
    return;
  }
  const clearance = clearancesForObject(project, object);
  dom.selectionInspector.innerHTML = `
    <div class="inspector-heading">
      <div><small>Selected product</small><strong>${escapeHtml(object.label)}</strong></div>
      <button type="button" class="icon-button danger" data-action="delete-selected" aria-label="Delete selected product"><i class="fa-solid fa-trash"></i></button>
    </div>
    <label class="inspector-family">Swap model family
      <select data-inspector="family">
        ${PRODUCTS.map(
          (product) =>
            `<option value="${product.family}" ${object.family === product.family ? "selected" : ""}>${product.label}</option>`,
        ).join("")}
      </select>
    </label>
    <div class="inspector-grid">
      ${inspectorNumber("X", "position.x", object.position.x * 1000)}
      ${inspectorNumber("Z", "position.z", object.position.z * 1000)}
      ${inspectorNumber("Rotate", "rotation", object.rotation, "product", "°", 15)}
      ${inspectorNumber("Price", "price", object.price ?? "", "product", "£", 0.01)}
      ${inspectorNumber("Width", "dimensions.width", object.dimensions.width)}
      ${inspectorNumber("Depth", "dimensions.depth", object.dimensions.depth)}
      ${inspectorNumber("Height", "dimensions.height", object.dimensions.height)}
    </div>
    <div class="clearance-strip">
      <span><small>Left</small>${Math.round(clearance.left * 1000)}mm</span>
      <span><small>Right</small>${Math.round(clearance.right * 1000)}mm</span>
      <span><small>Front</small>${Math.round(clearance.front * 1000)}mm</span>
      <span><small>Back</small>${Math.round(clearance.back * 1000)}mm</span>
    </div>
    ${
      object.metadata?.url
        ? `<a class="linked-product" href="${escapeHtml(object.metadata.url)}" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i> ${escapeHtml(object.metadata.retailer || "Linked product")}</a>`
        : ""
    }
  `;
}

function inspectorNumber(label, key, value, type = "product", suffix = "mm", step = 1) {
  return `
    <label>${label}
      <span><input type="number" step="${step}" value="${value}" data-inspector="${key}" data-inspector-type="${type}"><small>${suffix}</small></span>
    </label>
  `;
}

function renderWarnings() {
  const warnings = collisionWarnings(project);
  if (!warnings.length) {
    dom.warningPanel.className = "warning-panel is-clear";
    dom.warningPanel.innerHTML =
      '<i class="fa-solid fa-circle-check"></i><span><strong>No current fit clashes</strong><small>Keep checking door swings and real-world access at survey.</small></span>';
    return;
  }
  dom.warningPanel.className = "warning-panel has-warning";
  dom.warningPanel.innerHTML = `
    <i class="fa-solid fa-triangle-exclamation"></i>
    <span><strong>${warnings.length} fit warning${warnings.length === 1 ? "" : "s"}</strong><small>${escapeHtml(
      warnings[0].message,
    )}</small></span>
    <button type="button" data-action="show-warnings">View</button>
  `;
}

function sectionPrice(section) {
  if (section.maximum === null) {
    if (section.minimum > 0) return `From ${formatMoney(section.minimum)}`;
    return "Survey required";
  }
  if (Math.round(section.minimum) === Math.round(section.maximum)) {
    return section.minimum > 0 ? formatMoney(section.minimum) : "Not entered";
  }
  return `${formatMoney(section.minimum)}–${formatMoney(section.maximum)}`;
}

function renderEstimate() {
  const estimate = calculateEstimate(project);
  const total =
    estimate.maximum !== null
      ? `${formatMoney(estimate.minimum)}–${formatMoney(estimate.maximum)}`
      : estimate.minimum > 0
        ? `From ${formatMoney(estimate.minimum)}`
        : "Survey required";
  dom.estimatePanel.innerHTML = `
    <div class="estimate-heading">
      <div><p>Live estimate</p><h2>${total}</h2></div>
      <button id="estimateClose" class="estimate-close" type="button" aria-label="Close estimate"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="published-guide">
      <span>Published project guide</span><strong>${estimate.publishedGuide}</strong>
    </div>
    <div class="estimate-sections">
      ${ESTIMATE_SECTIONS.map((definition) => {
        const section = estimate.sections[definition.id];
        return `
          <div class="${section.surveyDependent ? "is-unconfirmed" : ""}">
            <span>${definition.label}</span>
            <strong>${sectionPrice(section)}</strong>
          </div>
        `;
      }).join("")}
    </div>
    <div class="estimate-status">
      <span class="status-dot"></span>
      <div><strong>${estimate.serviceStatus}</strong><small>Indicative services assessment</small></div>
    </div>
    <p class="estimate-note">Early budget guide only. Survey-dependent items are not silently priced.</p>
    <button class="primary-button full-button" type="button" data-stage-jump="5">Review full estimate</button>
  `;
  dom.estimateToggle.innerHTML = `<span>Live estimate</span><strong>${total}</strong>`;
}

function updateToolbar() {
  dom.undo.disabled = history.length === 0;
  dom.redo.disabled = future.length === 0;
  dom.delete.disabled = !selectedId || selectedId === "__ensuite__";
}

function bindCatalogueDrag() {
  dom.stagePanel.querySelectorAll(".catalogue-card").forEach((card) => {
    card.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/product-family", card.dataset.family);
      event.dataTransfer.effectAllowed = "copy";
      dom.canvas.classList.add("is-drop-target");
    });
    card.addEventListener("dragend", () => dom.canvas.classList.remove("is-drop-target"));
  });
}

async function inspectProductLink() {
  const input = document.querySelector("#productUrl");
  const url = input?.value.trim();
  if (!url) {
    showToast("Paste a product link first");
    return;
  }
  const classification = classifyProductLink(url);
  importDraft = {
    url,
    family: classification.family,
    confidence: classification.confidence,
    name: classification.inferredName,
    retailer: classification.retailer,
    price: null,
    image: "",
    finish: "",
    dimensions: classification.family
      ? deepClone(PRODUCT_BY_FAMILY[classification.family].dimensions)
      : null,
    missing: ["Displayed price", "Exact dimensions"],
    status: "The link was classified from its public URL. Trying to read retailer metadata…",
  };
  renderStage();

  try {
    const response = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!response.ok) throw new Error(`Retailer returned ${response.status}`);
    const html = await response.text();
    const documentData = new DOMParser().parseFromString(html, "text/html");
    const meta = (property) =>
      documentData.querySelector(`meta[property="${property}"], meta[name="${property}"]`)?.content ||
      "";
    const title = meta("og:title") || documentData.title || importDraft.name;
    const priceText =
      meta("product:price:amount") ||
      documentData.querySelector('[itemprop="price"]')?.content ||
      documentData.body?.textContent?.match(/£\s?[\d,.]+/)?.[0] ||
      "";
    const numericPrice = Number(String(priceText).replace(/[^\d.]/g, "")) || null;
    const combinedText = `${title} ${meta("description")} ${documentData.body?.textContent?.slice(0, 120000) || ""}`;
    const dimensions = parseDimensionsFromText(combinedText);
    const refined = classifyProductLink(url, combinedText.slice(0, 5000));
    importDraft = {
      ...importDraft,
      family: refined.family || importDraft.family,
      confidence: Math.max(importDraft.confidence, refined.confidence),
      name: title,
      price: numericPrice,
      image: meta("og:image"),
      dimensions: dimensions || importDraft.dimensions,
      status: "Public retailer metadata was read. Please verify every imported detail.",
    };
  } catch {
    importDraft.status =
      "This retailer did not permit reliable browser access. Please confirm the missing price and dimensions below.";
  }
  importDraft.missing = [
    !importDraft.family && "Model family",
    !importDraft.name && "Product name",
    !importDraft.price && "Displayed price",
    !importDraft.dimensions && "Exact dimensions",
  ].filter(Boolean);
  renderStage();
}

function addImportedProduct() {
  const family = document.querySelector("#importFamily")?.value;
  if (!family) {
    showToast("Choose the closest internal model family");
    return;
  }
  const definition = PRODUCT_BY_FAMILY[family];
  const width = Number(document.querySelector("#importWidth")?.value) || definition.dimensions.width;
  const depth = Number(document.querySelector("#importDepth")?.value) || definition.dimensions.depth;
  const height = Number(document.querySelector("#importHeight")?.value) || definition.dimensions.height;
  commitChange(() => {
    const object = addProduct(project, family);
    object.label = document.querySelector("#importName")?.value.trim() || definition.label;
    object.dimensions = { width, depth, height };
    object.price = Number(document.querySelector("#importPrice")?.value) || null;
    const finish = document.querySelector("#importFinish")?.value.trim() || "";
    object.metadata = {
      productName: object.label,
      retailer: document.querySelector("#importRetailer")?.value.trim() || "",
      url: importDraft.url,
      displayedPrice: object.price,
      image: document.querySelector("#importImage")?.value.trim() || "",
      width,
      depth,
      height,
      finish,
      modelFamily: family,
      importConfidence: importDraft.confidence,
      missingInformation: [
        !object.price && "Displayed price",
        !document.querySelector("#importWidth")?.value && "Verified dimensions",
      ].filter(Boolean),
    };
    selectedId = object.id;
    importDraft = null;
  });
  engine?.select(selectedId);
  showToast("Linked product added");
}

function addFamily(family, position = null) {
  commitChange(() => {
    const object = addProduct(project, family, position || {});
    selectedId = object.id;
  });
  engine?.select(selectedId);
  showToast(`${PRODUCT_BY_FAMILY[family].label} added`);
}

function removeSelected() {
  if (!selectedId || selectedId === "__ensuite__") return;
  const object = project.objects.find((item) => item.id === selectedId);
  if (!object) return;
  commitChange(() => {
    project.objects = project.objects.filter((item) => item.id !== selectedId);
    selectedId = null;
  });
  showToast(`${object.label} removed`);
}

function updateBoundInput(input) {
  const path = input.dataset.bind;
  if (!path) return;
  let value = input.type === "checkbox" ? input.checked : input.value;
  if (input.dataset.number) value = value === "" ? null : Number(value);
  commitChange(() => {
    if (path.startsWith("ensuite.") && project.ensuite) {
      const key = path.replace("ensuite.", "");
      if (!key.includes(".")) {
        resizeEnsuite(project, { [key]: value }, ["x", "z"].includes(key));
      } else {
        setPath(project, path, value);
      }
    } else {
      setPath(project, path, value);
      if (["room.width", "room.length"].includes(path) && project.ensuite) {
        resizeEnsuite(project, {}, false);
      }
    }
  });
}

function updateOpening(input) {
  const opening = project.room.openings.find((item) => item.id === input.dataset.opening);
  if (!opening) return;
  const key = input.dataset.key;
  const value = input.type === "number" ? Number(input.value) : input.value;
  commitChange(() => {
    opening[key] = value;
  });
}

function updateInspector(input) {
  if (!selectedId) return;
  if (input.dataset.inspectorType === "ensuite") {
    const key = input.dataset.inspector;
    commitChange(() => resizeEnsuite(project, { [key]: Number(input.value) / 1000 }, ["x", "z"].includes(key)));
    return;
  }
  const object = project.objects.find((item) => item.id === selectedId);
  if (!object) return;
  const key = input.dataset.inspector;
  if (key === "family") {
    commitChange(() => swapProductFamily(object, input.value));
    return;
  }
  const value = Number(input.value);
  commitChange(() => {
    if (key === "position.x" || key === "position.z") {
      setPath(object, key, value / 1000);
    } else if (key.startsWith("dimensions.")) {
      setPath(object, key, Math.max(20, value));
    } else {
      setPath(object, key, input.value === "" ? null : value);
    }
  });
}

function updateLiveBoundInput(input) {
  const path = input.dataset.bind;
  if (!path) return;
  const livePaths = [
    "customer.",
    "notes",
    "finishes.wallTilePrice",
    "finishes.floorTilePrice",
    "finishes.wallTileBoxCoverage",
    "finishes.floorTileBoxCoverage",
    "finishes.wastagePercent",
  ];
  if (!livePaths.some((prefix) => path.startsWith(prefix))) return;
  const numeric = input.dataset.number === "true";
  setPath(project, path, numeric ? (input.value === "" ? null : Number(input.value)) : input.value);
  renderEstimate();
  updateTileQuantityDisplay();
  scheduleSave();
}

function updateTileQuantityDisplay() {
  const card = dom.stagePanel.querySelector(".quantity-card");
  if (!card) return;
  const quantity = calculateTileQuantities(project);
  card.innerHTML = `
    <div><small>Wall tile area</small><strong>${quantity.wallArea.toFixed(
      1,
    )}m²</strong><span>${quantity.wallOrderArea.toFixed(1)}m² incl. wastage · ${
      quantity.wallTiles
    } tiles${quantity.wallBoxes ? ` · ${quantity.wallBoxes} boxes` : ""}</span></div>
    <div><small>Floor tile area</small><strong>${quantity.floorArea.toFixed(
      1,
    )}m²</strong><span>${quantity.floorOrderArea.toFixed(1)}m² incl. wastage · ${
      quantity.floorTiles
    } tiles${quantity.floorBoxes ? ` · ${quantity.floorBoxes} boxes` : ""}</span></div>
    <div><small>Entered tile cost</small><strong>${formatMoney(
      quantity.price,
    )}</strong><span>Only prices you entered are included.</span></div>
  `;
}

function updateLiveInspector(input) {
  if (!selectedId) return;
  const object = project.objects.find((item) => item.id === selectedId);
  if (!object) return;
  const key = input.dataset.inspector;
  const value = input.value === "" ? null : Number(input.value);
  if (key === "price") {
    object.price = value;
    renderEstimate();
  } else if (key === "position.x" || key === "position.z") {
    setPath(object, key, Number(value || 0) / 1000);
    engine?.syncObjectTransforms();
    engine?.rebuildRoutes();
    renderWarnings();
    engine?.updateWarnings(collisionWarnings(project));
  } else if (key === "rotation") {
    object.rotation = Number(value || 0);
    engine?.syncObjectTransforms();
    renderWarnings();
    engine?.updateWarnings(collisionWarnings(project));
  } else {
    return;
  }
  scheduleSave();
}

function addOpening(type) {
  commitChange(() => {
    project.room.openings.push({
      id: makeObject(type === "door" ? "door" : "window").id,
      type,
      wall: type === "door" ? "south" : "north",
      offset: 0,
      width: type === "door" ? 0.76 : 0.9,
      height: type === "door" ? 2.04 : 0.9,
      sillHeight: type === "door" ? 0 : 1.05,
      opening: type === "door" ? "inward-left" : "fixed",
    });
  });
}

function projectSummary() {
  const estimate = calculateEstimate(project);
  const warningCount = collisionWarnings(project).length;
  return [
    "Hello, I have prepared a Bathroom Estimator project.",
    `Name: ${project.customer.name || "Not entered"}`,
    `Telephone: ${project.customer.telephone || "Not entered"}`,
    `Email: ${project.customer.email || "Not entered"}`,
    `Project: ${routeLabels[project.route]}`,
    `Outer room: ${project.room.width.toFixed(2)}m × ${project.room.length.toFixed(2)}m × ${project.room.height.toFixed(2)}m`,
    project.ensuite
      ? `Proposed en-suite: ${project.ensuite.width.toFixed(2)}m × ${project.ensuite.depth.toFixed(2)}m`
      : null,
    `Products placed: ${project.objects.length}`,
    `Published guide: ${estimate.publishedGuide}`,
    `Early service indication: ${estimate.serviceStatus}`,
    `Fit warnings to review: ${warningCount}`,
    `Notes: ${project.notes || "None"}`,
    "",
    "This is an early planning guide. Please verify measurements, services and viability at a home survey.",
  ]
    .filter(Boolean)
    .join("\n");
}

function handleAction(button) {
  const action = button.dataset.action;
  if (action === "change-route") {
    if (
      button.dataset.route !== project.route &&
      globalThis.confirm("Start a new route? The current design will be replaced.")
    ) {
      startRoute(button.dataset.route);
    }
  }
  if (action === "add-opening") addOpening(button.dataset.type);
  if (action === "remove-opening") {
    commitChange(() => {
      project.room.openings = project.room.openings.filter((item) => item.id !== button.dataset.id);
    });
  }
  if (action === "service-known") {
    commitChange(() => {
      project.services[button.dataset.service].known = button.dataset.known === "true";
    });
  }
  if (action === "nearest-known") {
    commitChange(() => {
      project.services.nearestBathroom.known = button.dataset.known === "true";
    });
  }
  if (action === "add-family") addFamily(button.dataset.family);
  if (action === "inspect-link") inspectProductLink();
  if (action === "add-imported") addImportedProduct();
  if (action === "tile-selection") {
    commitChange(() => {
      project.finishes.wallSelection = button.dataset.value;
    });
  }
  if (action === "delete-selected") removeSelected();
  if (action === "show-warnings") {
    const messages = collisionWarnings(project).map((warning) => `• ${warning.message}`).join("\n");
    globalThis.alert(messages);
  }
  if (action === "download-project") {
    const blob = new Blob([JSON.stringify(prepareProjectPayload(project), null, 2)], {
      type: "application/json",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `bathroom-estimator-${project.id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }
  if (action === "copy-summary") {
    navigator.clipboard
      .writeText(projectSummary())
      .then(() => showToast("Survey summary copied"))
      .catch(() => showToast("Copy was blocked — use the WhatsApp option instead"));
  }
  if (action === "whatsapp-project") {
    globalThis.open(
      `https://wa.me/442073860000?text=${encodeURIComponent(projectSummary())}`,
      "_blank",
      "noopener",
    );
  }
}

function bindEvents() {
  dom.routeGate.addEventListener("click", (event) => {
    const routeButton = event.target.closest("[data-route]");
    if (routeButton) startRoute(routeButton.dataset.route);
  });
  dom.resumeButton.addEventListener("click", () => {
    project = savedProject;
    savedProject = null;
    dom.routeGate.classList.add("is-hidden");
    history = [];
    future = [];
    refresh();
    showToast("Saved design restored");
  });
  dom.discardButton.addEventListener("click", () => {
    clearSavedProject();
    savedProject = null;
    renderResume();
  });
  dom.stageTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-stage]");
    if (!button) return;
    currentStage = Number(button.dataset.stage);
    refresh({ render3d: false });
  });
  dom.stagePanel.addEventListener("change", (event) => {
    if (event.target.matches("[data-bind]")) updateBoundInput(event.target);
    if (event.target.matches("[data-opening]")) updateOpening(event.target);
  });
  dom.stagePanel.addEventListener("input", (event) => {
    if (event.target.matches("[data-bind]")) updateLiveBoundInput(event.target);
  });
  dom.stagePanel.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]");
    if (action) handleAction(action);
    const jump = event.target.closest("[data-stage-jump]");
    if (jump) {
      currentStage = Number(jump.dataset.stageJump);
      refresh({ render3d: false });
    }
    const filter = event.target.closest("[data-filter]");
    if (filter) {
      dom.stagePanel.querySelectorAll("[data-filter]").forEach((item) => item.classList.toggle("is-active", item === filter));
      dom.stagePanel.querySelectorAll(".catalogue-card").forEach((card) => {
        card.hidden =
          filter.dataset.filter !== "all" &&
          PRODUCT_BY_FAMILY[card.dataset.family].category !== filter.dataset.filter;
      });
    }
  });
  dom.selectionInspector.addEventListener("change", (event) => {
    if (event.target.matches("[data-inspector]")) updateInspector(event.target);
  });
  dom.selectionInspector.addEventListener("input", (event) => {
    if (event.target.matches("[data-inspector]")) updateLiveInspector(event.target);
  });
  dom.selectionInspector.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]");
    if (action) handleAction(action);
  });
  dom.estimatePanel.addEventListener("click", (event) => {
    if (event.target.closest("#estimateClose")) document.body.classList.remove("estimate-open");
    const jump = event.target.closest("[data-stage-jump]");
    if (jump) {
      currentStage = Number(jump.dataset.stageJump);
      document.body.classList.remove("estimate-open");
      refresh({ render3d: false });
    }
  });
  dom.estimateToggle.addEventListener("click", () => document.body.classList.add("estimate-open"));
  dom.back.addEventListener("click", () => {
    currentStage = Math.max(0, currentStage - 1);
    refresh({ render3d: false });
  });
  dom.next.addEventListener("click", () => {
    currentStage = Math.min(STAGES.length - 1, currentStage + 1);
    refresh({ render3d: false });
  });
  dom.undo.addEventListener("click", () => {
    if (!history.length) return;
    future.push(snapshot());
    project = history.pop();
    selectedId = null;
    refresh();
    showToast("Undid last change");
  });
  dom.redo.addEventListener("click", () => {
    if (!future.length) return;
    history.push(snapshot());
    project = future.pop();
    selectedId = null;
    refresh();
    showToast("Redid change");
  });
  dom.delete.addEventListener("click", removeSelected);
  dom.reset.addEventListener("click", () => {
    if (!globalThis.confirm("Reset this design to its starter layout?")) return;
    const route = project.route;
    commitChange(() => {
      project = createDefaultProject(route);
      selectedId = null;
    });
    showToast("Room reset");
  });
  document.querySelectorAll("[data-transform]").forEach((button) => {
    button.addEventListener("click", () => {
      engine?.setTransformMode(button.dataset.transform);
      document.querySelectorAll("[data-transform]").forEach((item) => item.classList.toggle("is-active", item === button));
    });
  });
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      engine?.setView(button.dataset.view);
      dom.walkPad.hidden = button.dataset.view !== "walk";
      document.querySelectorAll("[data-view]").forEach((item) => item.classList.toggle("is-active", item === button));
    });
  });
  dom.walkPad.addEventListener("click", (event) => {
    const button = event.target.closest("[data-walk]");
    if (button) engine?.moveWalk(button.dataset.walk);
  });
  dom.wallFade.addEventListener("change", () => engine?.setAutoFadeWalls(dom.wallFade.checked));

  dom.canvas.addEventListener("dragover", (event) => {
    if (!event.dataTransfer.types.includes("text/product-family")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  });
  dom.canvas.addEventListener("dragleave", (event) => {
    if (!dom.canvas.contains(event.relatedTarget)) dom.canvas.classList.remove("is-drop-target");
  });
  dom.canvas.addEventListener("drop", (event) => {
    event.preventDefault();
    dom.canvas.classList.remove("is-drop-target");
    const family = event.dataTransfer.getData("text/product-family");
    if (!PRODUCT_BY_FAMILY[family]) return;
    addFamily(family, engine?.screenToFloor(event.clientX, event.clientY));
  });
}

function initializeEngine() {
  try {
    engine = new Bathroom3DEngine(dom.canvas, {
      onError: () => {
        dom.empty3d.hidden = false;
      },
      onSelect: (id) => {
        selectedId = id;
        renderInspector();
        updateToolbar();
      },
      onWallSelected: (wallId) => {
        const wall = wallId.split("-").at(-1);
        commitChange(
          () => {
            project.finishes.wallSelection = "one";
            project.finishes.selectedWall = wall;
            currentStage = 3;
          },
          { render3d: false },
        );
        showToast(`${wall[0].toUpperCase()}${wall.slice(1)} wall selected for tiling`);
      },
      onTransform: ({ id, type, position, rotation, commit }) => {
        if (!transformBaseline) transformBaseline = snapshot();
        if (type === "ensuite") {
          resizeEnsuite(project, { x: position.x, z: position.z }, true);
        } else {
          moveObject(project, id, position, rotation);
        }
        renderInspector();
        renderWarnings();
        renderEstimate();
        engine?.updateWarnings(collisionWarnings(project));
        if (commit) {
          history.push(transformBaseline);
          if (history.length > 60) history.shift();
          future = [];
          transformBaseline = null;
          updateToolbar();
          scheduleSave();
        }
      },
    });
    engine.renderProject(project);
  } catch (error) {
    console.error(error);
    dom.empty3d.hidden = false;
  }
}

renderResume();
renderStageTabs();
renderStage();
renderInspector();
renderWarnings();
renderEstimate();
updateToolbar();
bindEvents();
initializeEngine();
