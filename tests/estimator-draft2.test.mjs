import test from "node:test";
import assert from "node:assert/strict";

import {
  PROJECT_ROUTES,
  calculateDraft2Estimate,
  createDraft2State,
  createPartitionWall,
} from "../assets/js/estimator-draft2-core.mjs";
import { makeObject } from "../assets/js/estimator-core.mjs";

test("Draft 2 uses the agreed core starting prices", () => {
  const bathroom = calculateDraft2Estimate(createDraft2State("bathroom"));
  const ensuite = calculateDraft2Estimate(createDraft2State("ensuite"));
  const cloakroom = calculateDraft2Estimate(createDraft2State("cloakroom"));

  assert.equal(PROJECT_ROUTES.bathroom.baseMinimum, 4500);
  assert.equal(bathroom.minimum, 4500);
  assert.equal(PROJECT_ROUTES.ensuite.baseMinimum, 7000);
  assert.equal(ensuite.minimum, 7000);
  assert.equal(cloakroom.hasCorePrice, false);
  assert.equal(cloakroom.surveyRequired, true);
});

test("unpriced products add guide allowances and entered prices are exact", () => {
  const project = createDraft2State("bathroom");
  const toilet = makeObject("close-coupled-toilet");
  project.objects.push(toilet);
  let estimate = calculateDraft2Estimate(project);
  assert.ok(estimate.sections.products.minimum > 0);
  assert.ok(estimate.sections.products.maximum > estimate.sections.products.minimum);

  toilet.price = 399.95;
  estimate = calculateDraft2Estimate(project);
  assert.equal(estimate.sections.products.minimum, 399.95);
  assert.equal(estimate.sections.products.maximum, 399.95);
});

test("new en-suite drainage is provisional until the soil pipe is marked", () => {
  const project = createDraft2State("ensuite");
  const toilet = makeObject("wall-hung-toilet", { x: 0, z: 0 });
  project.objects.push(toilet);

  const unknown = calculateDraft2Estimate(project);
  assert.equal(unknown.surveyRequired, true);
  assert.ok(unknown.sections.drainage.minimum >= 900);

  project.services.soil = { known: true, x: 0, z: 0 };
  const nearby = calculateDraft2Estimate(project);
  assert.equal(nearby.surveyRequired, false);
  assert.ok(nearby.sections.drainage.maximum < unknown.sections.drainage.maximum);
});

test("drawn walls and selected tiling increase the live predictor", () => {
  const project = createDraft2State("bathroom");
  const before = calculateDraft2Estimate(project);
  project.walls.push(
    createPartitionWall(project, { x1: -1, z1: 0, x2: 1, z2: 0 }),
  );
  project.tiling.walls = "full";
  project.tiling.floor = true;
  const after = calculateDraft2Estimate(project);

  assert.ok(after.sections.walls.minimum > 0);
  assert.ok(after.sections.tiling.minimum > 0);
  assert.ok(after.minimum > before.minimum);
});
