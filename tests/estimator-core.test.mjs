import test from "node:test";
import assert from "node:assert/strict";

import {
  addProduct,
  calculateEstimate,
  calculateTileQuantities,
  classifyProductLink,
  collisionWarnings,
  createDefaultProject,
  moveObject,
  resizeEnsuite,
  restoreProject,
  saveProject,
} from "../assets/js/estimator-core.mjs";

test("pricing uses the website's published route guides", () => {
  const renovation = calculateEstimate(createDefaultProject("existing"));
  const ensuite = calculateEstimate(createDefaultProject("newEnsuite"));
  const cloakroom = calculateEstimate(createDefaultProject("cloakroom"));

  assert.equal(renovation.publishedGuide, "From around £9,000+");
  assert.ok(renovation.minimum >= 9000);
  assert.equal(renovation.maximum, null);

  assert.equal(ensuite.publishedGuide, "Often £12,000–£18,000+");
  assert.ok(ensuite.minimum >= 12000);
  assert.ok(ensuite.maximum >= 18000);

  assert.equal(cloakroom.publishedGuide, "Survey required");
  assert.equal(cloakroom.maximum, null);
});

test("customer-entered product prices update the live estimate exactly", () => {
  const project = createDefaultProject("existing");
  const before = calculateEstimate(project);
  project.objects[0].price = 1275.5;
  const after = calculateEstimate(project);

  assert.equal(after.confirmedProducts, 1275.5);
  assert.equal(after.minimum - before.minimum, 1275.5);
});

test("tile area, wastage and entered prices feed the live estimate", () => {
  const project = createDefaultProject("existing");
  project.finishes.wallTilePricePerSqm = 40;
  project.finishes.floorTilePricePerSqm = 30;
  project.finishes.wastagePercent = 10;

  const quantities = calculateTileQuantities(project);
  const estimate = calculateEstimate(project);

  assert.ok(quantities.wallArea > 0);
  assert.ok(quantities.floorArea > 0);
  assert.ok(quantities.wallOrderArea > quantities.wallArea);
  assert.ok(quantities.price > 0);
  assert.ok(estimate.sections.tiling.minimum > 1440);
});

test("product links map to editable internal model families", () => {
  const wallHung = classifyProductLink(
    "https://www.victorianplumbing.co.uk/example-wall-hung-toilet",
  );
  const quadrant = classifyProductLink(
    "https://retailer.example/bathrooms/900mm-offset-quadrant-enclosure",
  );
  const unknown = classifyProductLink("https://retailer.example/products/abc-123");

  assert.equal(wallHung.family, "wall-hung-toilet");
  assert.equal(wallHung.retailer, "Victorian Plumbing");
  assert.ok(wallHung.confidence > 0.5);
  assert.equal(quadrant.family, "quadrant-enclosure");
  assert.equal(unknown.family, null);
});

test("saving and restoring preserves a valid design", () => {
  const values = new Map();
  const storage = {
    setItem(key, value) {
      values.set(key, value);
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
  };
  const project = createDefaultProject("newEnsuite");
  project.customer.name = "Test Customer";
  project.objects[0].position.x = 0.42;

  saveProject(project, storage);
  const restored = restoreProject(storage);

  assert.equal(restored.route, "newEnsuite");
  assert.equal(restored.customer.name, "Test Customer");
  assert.equal(restored.objects[0].position.x, 0.42);
});

test("products can be added and moved in the shared scene state", () => {
  const project = createDefaultProject("existing");
  const initialCount = project.objects.length;
  const bath = addProduct(project, "bath", { x: 0.1, z: 0.2 });

  assert.equal(project.objects.length, initialCount + 1);
  moveObject(project, bath.id, { x: -0.35, z: 0.55 }, 90);
  assert.equal(bath.position.x, -0.35);
  assert.equal(bath.position.z, 0.55);
  assert.equal(bath.rotation, 90);
});

test("every project route opens with a usable collision-free starter layout", () => {
  for (const route of ["existing", "newEnsuite", "cloakroom"]) {
    const project = createDefaultProject(route);
    assert.ok(project.objects.length > 0);
    assert.deepEqual(collisionWarnings(project), []);
  }
});

test("moving and resizing the room-within-a-room keeps contents attached", () => {
  const project = createDefaultProject("newEnsuite");
  const originalZone = { ...project.ensuite };
  const originalProduct = { ...project.objects[0].position };

  resizeEnsuite(project, {
    x: originalZone.x + 0.2,
    z: originalZone.z - 0.1,
    width: 1.8,
    depth: 1.5,
  });

  assert.equal(project.ensuite.width, 1.8);
  assert.equal(project.ensuite.depth, 1.5);
  assert.ok(Math.abs(project.objects[0].position.x - (originalProduct.x + 0.2)) < 1e-9);
  assert.ok(Math.abs(project.objects[0].position.z - (originalProduct.z - 0.1)) < 1e-9);
});

test("collision warnings report overlap and objects outside the usable room", () => {
  const project = createDefaultProject("existing");
  project.objects = [];
  const first = addProduct(project, "wall-hung-toilet", { x: 0, z: 0 });
  const second = addProduct(project, "vanity-unit", { x: 0, z: 0 });
  const overlap = collisionWarnings(project);

  assert.ok(overlap.some((warning) => warning.type === "collision"));

  moveObject(project, second.id, { x: 20, z: 20 });
  const fit = collisionWarnings(project);
  assert.ok(fit.some((warning) => warning.type === "fit" && warning.ids.includes(second.id)));
  assert.ok(!fit.some((warning) => warning.type === "collision" && warning.ids.includes(first.id)));
});

test("moving sanitaryware recalculates drainage status and allowance", () => {
  const project = createDefaultProject("newEnsuite");
  project.services.soil = { known: true, x: project.objects[0].position.x, z: project.objects[0].position.z };
  const near = calculateEstimate(project);

  project.objects[0].position.x += 7;
  const far = calculateEstimate(project);

  assert.equal(near.serviceStatus, "Survey required");
  assert.equal(far.serviceStatus, "Current arrangement appears impractical");
  assert.ok(far.sections.plumbing.minimum > near.sections.plumbing.minimum);
  assert.ok(far.minimum > near.minimum);
});
