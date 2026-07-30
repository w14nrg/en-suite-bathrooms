import test from "node:test";
import assert from "node:assert/strict";

import {
  TILING_LABOUR_RATE,
  calculateDraft3Estimate,
  createDraft3State,
} from "../assets/js/estimator-draft3-core.mjs";
import { resizeZoneFromHandle } from "../assets/js/estimator-draft3-plan.mjs";

test("Draft 3 keeps the agreed bathroom and en-suite core prices", () => {
  const bathroom = calculateDraft3Estimate(createDraft3State("bathroom"));
  const ensuite = calculateDraft3Estimate(createDraft3State("ensuite"));
  const cloakroom = calculateDraft3Estimate(createDraft3State("cloakroom"));

  assert.equal(bathroom.sections.core.minimum, 4500);
  assert.equal(ensuite.sections.core.minimum, 7000);
  assert.equal(cloakroom.hasCorePrice, false);
  assert.equal(cloakroom.surveyRequired, true);
});

test("tiling uses customer-entered square metres and keeps tiles separate", () => {
  const state = createDraft3State("bathroom");
  state.tiling.wallSqm = 10;
  state.tiling.floorSqm = 4;
  state.tiling.tilePricePerSqm = 35;

  const estimate = calculateDraft3Estimate(state);
  assert.equal(estimate.sections.tiling.labourRate, TILING_LABOUR_RATE);
  assert.equal(estimate.sections.tiling.fitting, 840);
  assert.equal(estimate.sections.tiling.tileOrderArea, 15.4);
  assert.equal(estimate.sections.tiling.tileSupply, 539);
});

test("every side of the proposed en-suite can resize while the opposite side stays fixed", () => {
  const state = createDraft3State("ensuite");
  const baseline = { ...state.zone };
  const originalRight = baseline.x + baseline.width;
  const originalTop = baseline.z + baseline.depth;

  resizeZoneFromHandle(
    state.zone,
    baseline,
    "w",
    { x: baseline.x - 0.25, z: baseline.z },
    state.room,
  );
  assert.equal(state.zone.x, baseline.x - 0.25);
  assert.equal(state.zone.x + state.zone.width, originalRight);

  const secondBaseline = { ...state.zone };
  resizeZoneFromHandle(
    state.zone,
    secondBaseline,
    "s",
    { x: secondBaseline.x, z: secondBaseline.z - 0.2 },
    state.room,
  );
  assert.equal(state.zone.z, secondBaseline.z - 0.2);
  assert.equal(state.zone.z + state.zone.depth, originalTop);
});

test("known service routes are represented by start and exit points", () => {
  const state = createDraft3State("ensuite");
  state.services.hot = {
    known: true,
    startX: -1,
    startZ: -1,
    x: 0.5,
    z: 0.5,
  };
  state.services.waste = {
    known: true,
    startX: -0.8,
    startZ: -1,
    x: 0.1,
    z: 0.2,
  };

  assert.equal(state.services.hot.known, true);
  assert.notEqual(state.services.hot.startX, state.services.hot.x);
  assert.equal(state.services.waste.known, true);
});
