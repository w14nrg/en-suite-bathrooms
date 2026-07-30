import { PRODUCT_BY_FAMILY, PRODUCTS } from "../data/estimator-products.mjs";
import {
  SERVICE_DEFINITIONS,
  calculateDraft2Estimate,
  formatEstimateMoney,
  wallLength,
  workArea,
} from "./estimator-draft2-core.mjs";
import {
  escapeHtml,
  formatMetres,
  overlapWarnings,
  renderPlanSvg,
} from "./estimator-draft2-plan.mjs";

export const PALETTE = [
  ["close-coupled-toilet", "fa-toilet", "Toilet"],
  ["wall-hung-toilet", "fa-toilet", "Wall-hung WC"],
  ["vanity-unit", "fa-sink", "Vanity"],
  ["wall-mounted-basin", "fa-sink", "Basin"],
  ["square-enclosure", "fa-shower", "Shower"],
  ["quadrant-enclosure", "fa-shower", "Quadrant"],
  ["rectangular-enclosure", "fa-shower", "Rectangular"],
  ["bath", "fa-bath", "Bath"],
  ["heated-towel-rail", "fa-temperature-three-quarters", "Towel rail"],
  ["door", "fa-door-open", "Door"],
  ["window", "fa-border-all", "Window"],
  ["fixed-obstruction", "fa-cube", "Obstruction"],
];

export const LINK_PRODUCTS = PRODUCTS.filter(
  (product) => !["door", "window", "rooflight", "fixed-obstruction"].includes(product.family),
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

export function renderStaticControls(dom) {
  dom.palette.innerHTML = PALETTE.map(
    ([family, icon, label]) =>
      `<button type="button" class="fixture-button" data-family="${family}" title="Add ${escapeHtml(PRODUCT_BY_FAMILY[family].label)}"><i class="fa-solid ${icon}" aria-hidden="true"></i><span>${escapeHtml(label)}</span></button>`,
  ).join("");
  dom.productFamily.innerHTML = LINK_PRODUCTS.map(
    (product) => `<option value="${product.family}">${escapeHtml(product.label)}</option>`,
  ).join("");
}

export function createPlannerRenderer(dom, store, options = {}) {
  let wallPreview = null;
  const api = {
    setWallPreview(value) {
      wallPreview = value;
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
      dom.roomCardTitle.textContent = state.route === "ensuite" ? "Outer room size" : "Room size";
      dom.roomCardHelp.textContent =
        state.route === "ensuite"
          ? "Set the bedroom, loft or larger space first, then drag the gold en-suite room inside it."
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
      dom.wallTiling.value = state.tiling.walls;
      dom.floorTiling.checked = state.tiling.floor;
    },
    services() {
      const state = store.state;
      dom.serviceList.innerHTML = Object.entries(SERVICE_DEFINITIONS)
        .map(([key, definition]) => {
          const service = state.services[key];
          return `<div class="service-row"><span><i class="fa-solid ${definition.icon} service-icon" style="background:${definition.colour}" aria-hidden="true"></i><span><strong>${definition.label}</strong><small>${service.known ? "Marker shown on plan" : "Not marked"}</small></span></span><button type="button" class="${service.known ? "is-known" : ""}" data-service-toggle="${key}">${service.known ? "Known" : "Unknown"}</button></div>`;
        })
        .join("");
    },
    plan() {
      const state = store.state;
      renderPlanSvg(dom.planSvg, state, wallPreview);
      dom.emptyHint.hidden =
        Boolean(state.zone) ||
        state.objects.length > 0 ||
        state.walls.length > 0 ||
        Object.values(state.services).some((service) => service.known);
    },
    selection() {
      const state = store.state;
      if (!state.selected) {
        dom.selection.innerHTML = `<div class="selection-empty"><i class="fa-regular fa-hand-pointer" aria-hidden="true"></i><div><strong>Select anything to edit it</strong><span>Fixtures, walls, service markers and the new en-suite room can all be dragged directly.</span></div></div>`;
        return;
      }
      if (state.selected.type === "object") {
        const object = store.selectedObject();
        if (!object) return;
        const title = object.metadata?.productName || object.label;
        const price =
          Number(object.price) > 0
            ? ` · ${formatEstimateMoney(object.price)}`
            : " · price allowance used";
        dom.selection.innerHTML = `<div class="selection-heading"><div><small>Selected item</small><strong>${escapeHtml(title)}</strong><span>${object.dimensions.width} × ${object.dimensions.depth}mm${price}</span></div><button type="button" class="icon-button danger" data-selection-action="delete"><i class="fa-solid fa-trash"></i></button></div><div class="selection-actions"><button type="button" data-selection-action="rotate"><i class="fa-solid fa-rotate-right"></i> Rotate 90°</button><button type="button" data-selection-action="duplicate"><i class="fa-regular fa-copy"></i> Duplicate</button></div>`;
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
        dom.selection.innerHTML = `<div class="selection-heading"><div><small>Known service</small><strong>${definition.label}</strong><span>Drag the coloured marker to its approximate position.</span></div><button type="button" class="icon-button danger" data-selection-action="delete"><i class="fa-solid fa-eye-slash"></i></button></div>`;
        return;
      }
      dom.selection.innerHTML = `<div class="selection-heading"><div><small>Room within room</small><strong>New en-suite</strong><span>${formatMetres(state.zone.width)} × ${formatMetres(state.zone.depth)} · drag the room or its corner handle</span></div></div>`;
    },
    status() {
      const state = store.state;
      const warnings = [...overlapWarnings(state), ...calculateDraft2Estimate(state).warnings];
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
      dom.drawWall.hidden = Boolean(options.isDrawing?.());
      dom.cancelDraw.hidden = !options.isDrawing?.();
      dom.drawWallHint.hidden = !options.isDrawing?.();
    },
    estimate() {
      const state = store.state;
      const estimate = calculateDraft2Estimate(state);
      const cloakroom = state.route === "cloakroom";
      dom.estimateHeading.textContent = `${estimate.route.label} planning estimate`;
      dom.estimateNote.textContent = `${estimate.route.summary} ${estimate.route.note}`;
      dom.estimateTotal.textContent = cloakroom
        ? "Survey required"
        : range(estimate.minimum, estimate.maximum, {
            from: estimate.knownSelectionsMaximum === 0,
          });
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
          ? estimateLine(
              estimate.route.baseLabel,
              estimate.route.summary,
              estimate.sections.core.minimum,
              estimate.sections.core.maximum,
            )
          : estimateLine(
              estimate.route.baseLabel,
              "Cannot be priced until the toilet drainage route is surveyed.",
              null,
              null,
            ),
      );
      const products = estimate.sections.products;
      if (products.maximum > 0) {
        const note = [
          products.exactCount
            ? `${products.exactCount} entered price${products.exactCount === 1 ? "" : "s"}`
            : "",
          products.allowanceCount
            ? `${products.allowanceCount} guide allowance${products.allowanceCount === 1 ? "" : "s"}`
            : "",
        ]
          .filter(Boolean)
          .join(" · ");
        lines.push(estimateLine("Products", note, products.minimum, products.maximum));
      }
      if (estimate.sections.walls.maximum > 0) {
        lines.push(
          estimateLine(
            "Additional walls",
            "Added partitions beyond the standard route allowance.",
            estimate.sections.walls.minimum,
            estimate.sections.walls.maximum,
          ),
        );
      }
      if (estimate.sections.tiling.maximum > 0) {
        lines.push(
          estimateLine(
            "Tiling allowance",
            `${estimate.sections.tiling.wallArea.toFixed(1)}m² walls · ${estimate.sections.tiling.floorArea.toFixed(1)}m² floor`,
            estimate.sections.tiling.minimum,
            estimate.sections.tiling.maximum,
          ),
        );
      }
      if (
        estimate.sections.drainage.maximum > 0 ||
        estimate.sections.drainage.status !== "No drainage changes added"
      ) {
        lines.push(
          estimateLine(
            "Drainage",
            estimate.sections.drainage.status,
            estimate.sections.drainage.minimum,
            estimate.sections.drainage.maximum,
          ),
        );
      }
      if (estimate.sections.water.maximum > 0) {
        lines.push(
          estimateLine(
            "Hot and cold supplies",
            estimate.sections.water.note,
            estimate.sections.water.minimum,
            estimate.sections.water.maximum,
          ),
        );
      }
      lines.push(
        estimateLine(
          cloakroom ? "Known selections and additions" : "Current planning total",
          cloakroom
            ? "Core cloakroom installation is still survey required."
            : "Before survey confirmation and final quotation.",
          cloakroom ? estimate.knownSelectionsMinimum : estimate.minimum,
          cloakroom ? estimate.knownSelectionsMaximum : estimate.maximum,
          "is-total",
        ),
      );
      dom.estimateLines.innerHTML = lines.join("");
      dom.estimateWarnings.innerHTML = estimate.warnings
        .map(
          (warning) =>
            `<div class="estimate-warning"><i class="fa-solid fa-triangle-exclamation"></i><span>${escapeHtml(warning)}</span></div>`,
        )
        .join("");
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
