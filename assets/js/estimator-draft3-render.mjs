import { PRODUCT_BY_FAMILY, PRODUCTS } from "../data/estimator-products.mjs";
import {
  SERVICE_DEFINITIONS,
  TILING_LABOUR_RATE,
  calculateDraft3Estimate,
  formatEstimateMoney,
  wallLength,
  workArea,
} from "./estimator-draft3-core.mjs";
import {
  escapeHtml,
  formatMetres,
  overlapWarnings,
  renderPlanSvg,
} from "./estimator-draft3-plan.mjs";

const PRODUCT_GROUPS = [
  {
    id: "toilets",
    label: "Toilets",
    icon: "fa-toilet",
    families: [
      "close-coupled-toilet",
      "back-to-wall-toilet",
      "wall-hung-toilet",
      "concealed-cistern-frame",
    ],
  },
  {
    id: "basins",
    label: "Basins & furniture",
    icon: "fa-sink",
    families: ["wall-mounted-basin", "freestanding-basin", "vanity-unit"],
  },
  {
    id: "showering",
    label: "Showers & baths",
    icon: "fa-shower",
    families: [
      "shower-tray",
      "square-enclosure",
      "rectangular-enclosure",
      "quadrant-enclosure",
      "walk-in-screen",
      "bath",
    ],
  },
  {
    id: "brassware",
    label: "Taps & showers",
    icon: "fa-faucet-drip",
    families: ["basin-tap", "concealed-shower", "exposed-shower"],
  },
  {
    id: "finishing",
    label: "Finishing touches",
    icon: "fa-wand-magic-sparkles",
    families: ["heated-towel-rail", "mirror"],
  },
  {
    id: "building",
    label: "Doors, windows & structure",
    icon: "fa-ruler-combined",
    families: ["door", "window", "rooflight", "fixed-obstruction"],
  },
];

export const LINK_PRODUCTS = PRODUCTS.filter(
  (product) =>
    !["door", "window", "rooflight", "fixed-obstruction"].includes(
      product.family,
    ),
);

function range(minimum, maximum, options = {}) {
  if (minimum === null || maximum === null) return "Survey required";
  if (Math.round(minimum) === Math.round(maximum)) {
    return `${options.from ? "From " : ""}${formatEstimateMoney(minimum)}`;
  }
  return `${options.from ? "From " : ""}${formatEstimateMoney(minimum)}–${formatEstimateMoney(maximum)}`;
}

function estimateLine(title, note, minimum, maximum, className = "") {
  return `<div class="estimate-line ${className}"><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(note)}</small></span><b>${range(minimum, maximum)}</b></div>`;
}

function familyIcon(product) {
  const kind = product?.modelKind || "";
  if (kind.startsWith("toilet") || kind === "frame") return "fa-toilet";
  if (kind.includes("basin") || kind === "vanity") return "fa-sink";
  if (kind.includes("enclosure") || kind === "screen" || kind === "tray") return "fa-shower";
  if (kind === "bath") return "fa-bath";
  if (kind.includes("shower") || kind === "tap") return "fa-faucet-drip";
  if (kind === "towel-rail") return "fa-temperature-three-quarters";
  if (kind === "mirror") return "fa-border-all";
  if (kind === "door") return "fa-door-open";
  if (kind === "window" || kind === "rooflight") return "fa-border-all";
  return "fa-cube";
}

export function renderStaticControls(dom) {
  dom.palette.innerHTML = PRODUCT_GROUPS.map((group, groupIndex) => {
    const buttons = group.families
      .filter((family) => PRODUCT_BY_FAMILY[family])
      .map((family) => {
        const product = PRODUCT_BY_FAMILY[family];
        return `<button type="button" class="fixture-button" data-family="${family}" title="Add ${escapeHtml(product.label)}"><i class="fa-solid ${familyIcon(product)}" aria-hidden="true"></i><span>${escapeHtml(product.label)}</span></button>`;
      })
      .join("");
    return `<details class="product-group" ${groupIndex === 0 ? "open" : ""}><summary><span><i class="fa-solid ${group.icon}" aria-hidden="true"></i><strong>${group.label}</strong></span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></summary><div class="fixture-palette">${buttons}</div></details>`;
  }).join("");

  dom.productFamily.innerHTML = LINK_PRODUCTS.map(
    (product) =>
      `<option value="${product.family}">${escapeHtml(product.label)}</option>`,
  ).join("");
}

export function createPlannerRenderer(dom, store, options = {}) {
  let wallPreview = null;
  let servicePreview = null;
  const api = {
    setWallPreview(value) {
      wallPreview = value;
      api.plan();
    },
    setServicePreview(value) {
      servicePreview = value;
      api.plan();
    },
    route() {
      const state = store.state;
      dom.routeChoices.querySelectorAll("[data-route]").forEach((button) => {
        const active = button.dataset.route === state.route;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      dom.ensuiteControls.hidden = state.route !== "ensuite";
      dom.roomCardTitle.textContent = state.route === "ensuite" ? "Outer room and en-suite" : "Room size and walls";
      dom.roomCardHelp.textContent =
        state.route === "ensuite"
          ? "Set the bedroom or loft first. The gold en-suite can be resized from every side and corner."
          : "Type the measurements or drag the gold handles on the plan.";
    },
    inputs() {
      const state = store.state;
      dom.width.value = state.room.width.toFixed(2);
      dom.length.value = state.room.length.toFixed(2);
      dom.height.value = state.room.height.toFixed(2);
      if (state.zone) {
        dom.zoneWidth.value = state.zone.width.toFixed(2);
        dom.zoneDepth.value = state.zone.depth.toFixed(2);
      }
      dom.wallSqm.value = state.tiling.wallSqm || "";
      dom.floorSqm.value = state.tiling.floorSqm || "";
      dom.tileLink.value = state.tiling.tileLink || "";
      dom.tilePrice.value = state.tiling.tilePricePerSqm ?? "";
      dom.tilingRate.textContent = `${formatEstimateMoney(state.tiling.labourRate || TILING_LABOUR_RATE)}/m²`;
    },
    services() {
      const state = store.state;
      dom.serviceList.innerHTML = Object.entries(SERVICE_DEFINITIONS)
        .map(([key, definition]) => {
          const service = state.services[key];
          return `<div class="service-row"><span><i class="fa-solid ${definition.icon} service-icon" style="background:${definition.colour}" aria-hidden="true"></i><span><strong>${definition.label}</strong><small>${service.known ? "Route shown on plan" : definition.help}</small></span></span><span class="service-actions"><button type="button" class="${service.known ? "is-known" : ""}" data-service-draw="${key}">${service.known ? "Redraw" : "Draw"}</button>${service.known ? `<button type="button" class="service-hide" data-service-hide="${key}" aria-label="Hide ${definition.label}"><i class="fa-solid fa-xmark"></i></button>` : ""}</span></div>`;
        })
        .join("");
    },
    photo() {
      const photo = store.state.photo;
      dom.photoPreview.hidden = !photo?.dataUrl;
      dom.removePhoto.hidden = !photo?.dataUrl;
      if (photo?.dataUrl) {
        dom.photoImage.src = photo.dataUrl;
        dom.photoImage.alt = photo.name || "Uploaded current bathroom";
        dom.photoStatus.textContent = photo.name || "Current bathroom photo added";
      } else {
        dom.photoImage.removeAttribute("src");
        dom.photoStatus.textContent = "No photo added yet.";
      }
    },
    plan() {
      const state = store.state;
      renderPlanSvg(dom.planSvg, state, wallPreview, servicePreview);
      dom.emptyHint.hidden =
        Boolean(state.zone) ||
        state.objects.length > 0 ||
        state.walls.length > 0 ||
        Object.values(state.services).some((service) => service.known);
    },
    selection() {
      const state = store.state;
      if (!state.selected) {
        dom.selection.innerHTML = `<div class="selection-empty"><i class="fa-regular fa-hand-pointer" aria-hidden="true"></i><div><strong>Select anything to edit it</strong><span>Fixtures, walls, service routes and the en-suite room can all be dragged directly.</span></div></div>`;
        return;
      }
      if (state.selected.type === "object") {
        const object = store.selectedObject();
        if (!object) return;
        const title = object.metadata?.productName || object.label;
        const price = Number(object.price) > 0 ? ` · ${formatEstimateMoney(object.price)}` : " · price allowance used";
        dom.selection.innerHTML = `<div class="selection-heading"><div><small>Selected item</small><strong>${escapeHtml(title)}</strong><span>${object.dimensions.width} × ${object.dimensions.depth}mm · ${Number(object.rotation) || 0}°${price}</span></div><button type="button" class="icon-button danger" data-selection-action="delete"><i class="fa-solid fa-trash"></i></button></div><div class="selection-actions"><button type="button" data-selection-action="rotate"><i class="fa-solid fa-rotate-right"></i> Rotate 90°</button><button type="button" data-selection-action="duplicate"><i class="fa-regular fa-copy"></i> Duplicate</button></div>`;
        return;
      }
      if (state.selected.type === "wall") {
        const wall = store.selectedWall();
        if (!wall) return;
        dom.selection.innerHTML = `<div class="selection-heading"><div><small>Selected wall</small><strong>Added partition wall</strong><span>${wallLength(wall).toFixed(2)}m long · drag either gold end</span></div><button type="button" class="icon-button danger" data-selection-action="delete"><i class="fa-solid fa-trash"></i></button></div><div class="selection-actions"><button type="button" data-selection-action="rotate"><i class="fa-solid fa-rotate-right"></i> Rotate 90°</button><button type="button" data-selection-action="delete"><i class="fa-solid fa-eraser"></i> Remove wall</button></div>`;
        return;
      }
      if (state.selected.type === "service") {
        const definition = SERVICE_DEFINITIONS[state.selected.id];
        dom.selection.innerHTML = `<div class="selection-heading"><div><small>Known service route</small><strong>${definition.label}</strong><span>Drag either end of the coloured line, or choose Redraw in Known services.</span></div><button type="button" class="icon-button danger" data-selection-action="delete"><i class="fa-solid fa-eye-slash"></i></button></div>`;
        return;
      }
      dom.selection.innerHTML = `<div class="selection-heading"><div><small>Room within room</small><strong>New en-suite</strong><span>${formatMetres(state.zone.width)} × ${formatMetres(state.zone.depth)} · use any of the eight gold handles</span></div></div>`;
    },
    status() {
      const state = store.state;
      const warnings = [...overlapWarnings(state), ...calculateDraft3Estimate(state).warnings];
      dom.warning.hidden = warnings.length === 0;
      dom.warning.innerHTML = warnings.length
        ? `<i class="fa-solid fa-triangle-exclamation"></i><span>${escapeHtml(warnings[0])}${warnings.length > 1 ? ` and ${warnings.length - 1} more check${warnings.length === 2 ? "" : "s"}.` : ""}</span>`
        : "";
      const area = workArea(state);
      const roomLabel =
        state.route === "ensuite"
          ? `En-suite ${formatMetres(area.width)} × ${formatMetres(area.depth)} inside ${formatMetres(state.room.width)} × ${formatMetres(state.room.length)}`
          : `${formatMetres(state.room.width)} × ${formatMetres(state.room.length)} · ${formatMetres(state.room.height)} high`;
      dom.roomSummary.textContent = `${roomLabel} · ${state.objects.length} item${state.objects.length === 1 ? "" : "s"}`;
      dom.undo.disabled = !store.canUndo;
      dom.redo.disabled = !store.canRedo;
      dom.clearFixtures.disabled = !state.objects.length;
      dom.clearWalls.disabled = !state.walls.length;
      dom.drawWall.hidden = Boolean(options.isDrawingWall?.());
      dom.cancelDraw.hidden = !options.isDrawingWall?.();
      dom.drawWallHint.hidden = !options.isDrawingWall?.();
      dom.serviceDrawHint.hidden = !options.isDrawingService?.();
      if (options.isDrawingService?.()) {
        dom.serviceDrawHint.textContent = `Drag a line on the 2D plan for ${SERVICE_DEFINITIONS[options.serviceKey?.()]?.label || "the service"}.`;
      }
    },
    estimate() {
      const state = store.state;
      const estimate = calculateDraft3Estimate(state);
      const cloakroom = state.route === "cloakroom";
      dom.estimateHeading.textContent = `${estimate.route.label} planning estimate`;
      dom.estimateNote.textContent = `${estimate.route.summary} ${estimate.route.note}`;
      dom.estimateTotal.textContent = cloakroom
        ? "Survey required"
        : range(estimate.minimum, estimate.maximum, { from: estimate.knownSelectionsMaximum === 0 });
      dom.estimateStatus.textContent = cloakroom
        ? estimate.knownSelectionsMaximum > 0
          ? `Selections ${range(estimate.knownSelectionsMinimum, estimate.knownSelectionsMaximum)}`
          : "Drainage must be checked"
        : estimate.surveyRequired
          ? "Survey needed"
          : "Early guide";

      const lines = [];
      lines.push(
        estimate.hasCorePrice
          ? estimateLine(estimate.route.baseLabel, estimate.route.summary, estimate.sections.core.minimum, estimate.sections.core.maximum)
          : estimateLine(estimate.route.baseLabel, "Cannot be priced until the toilet drainage route is surveyed.", null, null),
      );
      const products = estimate.sections.products;
      if (products.maximum > 0) {
        const note = [
          products.exactCount ? `${products.exactCount} entered price${products.exactCount === 1 ? "" : "s"}` : "",
          products.allowanceCount ? `${products.allowanceCount} guide allowance${products.allowanceCount === 1 ? "" : "s"}` : "",
        ].filter(Boolean).join(" · ");
        lines.push(estimateLine("Products", note, products.minimum, products.maximum));
      }
      if (estimate.sections.walls.maximum > 0) {
        lines.push(estimateLine("Additional walls", "Added partitions beyond the standard route allowance.", estimate.sections.walls.minimum, estimate.sections.walls.maximum));
      }
      if (estimate.sections.tiling.fitting > 0) {
        lines.push(estimateLine("Tiling labour", `${estimate.sections.tiling.totalArea.toFixed(1)}m² at ${formatEstimateMoney(estimate.sections.tiling.labourRate)}/m² · tiles excluded`, estimate.sections.tiling.fitting, estimate.sections.tiling.fitting));
      }
      if (estimate.sections.tiling.tileSupply > 0) {
        lines.push(estimateLine("Tile supply", `${estimate.sections.tiling.tileOrderArea.toFixed(1)}m² including 10% wastage at ${formatEstimateMoney(estimate.sections.tiling.tilePricePerSqm)}/m²`, estimate.sections.tiling.tileSupply, estimate.sections.tiling.tileSupply));
      }
      if (estimate.sections.drainage.maximum > 0 || estimate.sections.drainage.status !== "No drainage changes added") {
        lines.push(estimateLine("Drainage", estimate.sections.drainage.status, estimate.sections.drainage.minimum, estimate.sections.drainage.maximum));
      }
      if (estimate.sections.water.maximum > 0) {
        lines.push(estimateLine("Hot and cold supplies", estimate.sections.water.note, estimate.sections.water.minimum, estimate.sections.water.maximum));
      }
      lines.push(estimateLine(cloakroom ? "Known selections and additions" : "Current planning total", cloakroom ? "Core cloakroom installation is still survey required." : "Before survey confirmation and final quotation.", cloakroom ? estimate.knownSelectionsMinimum : estimate.minimum, cloakroom ? estimate.knownSelectionsMaximum : estimate.maximum, "is-total"));
      dom.estimateLines.innerHTML = lines.join("");
      dom.estimateWarnings.innerHTML = estimate.warnings.map((warning) => `<div class="estimate-warning"><i class="fa-solid fa-triangle-exclamation"></i><span>${escapeHtml(warning)}</span></div>`).join("");
    },
    view() {
      const state = store.state;
      document.querySelectorAll("[data-view]").forEach((button) => {
        const active = button.dataset.view === state.view;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      dom.planSurface.hidden = state.view !== "2d";
      dom.threeSurface.hidden = state.view !== "3d";
      dom.centre3d.hidden = state.view !== "3d";
      if (state.view === "3d") options.render3d?.(state);
    },
    all(renderOptions = {}) {
      api.route();
      api.inputs();
      api.services();
      api.photo();
      api.plan();
      api.selection();
      api.status();
      api.estimate();
      api.view();
      if (renderOptions.saved) dom.saveStatus.textContent = "Saved on this device";
      else if (renderOptions.save !== false) dom.saveStatus.textContent = "Saving…";
    },
  };
  return api;
}
