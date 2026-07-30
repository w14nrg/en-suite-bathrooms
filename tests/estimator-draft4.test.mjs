import test from "node:test";
import assert from "node:assert/strict";

import {
  TILING_CATEGORIES,
  calculateDraft4Estimate,
  calculatedTilingAreas,
  createDraft4State,
  effectiveTilingAreas,
} from "../assets/js/estimator-draft4-core.mjs";
import { createPlannerStore } from "../assets/js/estimator-draft4-store.mjs";
import { extractProductData } from "../functions/api/product-preview.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("Draft 4 keeps the agreed route starting prices", () => {
  const bathroom = calculateDraft4Estimate(createDraft4State("bathroom"));
  const ensuite = calculateDraft4Estimate(createDraft4State("ensuite"));
  const cloakroom = calculateDraft4Estimate(createDraft4State("cloakroom"));

  assert.equal(bathroom.sections.core.minimum, 4500);
  assert.equal(ensuite.sections.core.minimum, 7000);
  assert.equal(cloakroom.hasCorePrice, false);
  assert.equal(cloakroom.surveyRequired, true);
});

test("Draft 4 uses the supplied tiling bands including the 15 percent addition", () => {
  assert.deepEqual(TILING_CATEGORIES.standard, {
    label: "Standard tiles (30×60 or 60×60cm)",
    minimum: 63.25,
    maximum: 80.5,
  });
  assert.equal(TILING_CATEGORIES.metro.minimum, 80.5);
  assert.equal(TILING_CATEGORIES.metro.maximum, 103.5);
  assert.equal(TILING_CATEGORIES.large.maximum, 138);
  assert.equal(TILING_CATEGORIES.slab.minimum, 172.5);
  assert.equal(TILING_CATEGORIES.mosaic.maximum, 172.5);
  assert.equal(TILING_CATEGORIES.stone.maximum, 161);
});

test("tiling areas follow the drawn room and can be overridden by the customer", () => {
  const state = createDraft4State("bathroom");
  state.tiling.wallCoverage = "full";
  state.tiling.floorIncluded = true;

  const first = calculatedTilingAreas(state);
  assert.equal(first.floor, Number((2.1 * 2.45).toFixed(2)));
  assert.ok(first.wall > first.floor);

  state.room.width = 3;
  state.room.length = 4;
  const larger = calculatedTilingAreas(state);
  assert.equal(larger.floor, 12);
  assert.ok(larger.wall > first.wall);

  state.tiling.wallSqmOverride = 17.4;
  state.tiling.floorSqmOverride = 11.2;
  const effective = effectiveTilingAreas(state);
  assert.equal(effective.wall, 17.4);
  assert.equal(effective.floor, 11.2);
});

test("the tiling category changes the hidden fitting range without exposing one flat rate", () => {
  const state = createDraft4State("bathroom");
  state.tiling.wallCoverage = "full";
  state.tiling.floorIncluded = true;
  state.tiling.tileType = "standard";
  const standard = calculateDraft4Estimate(state).sections.tiling;
  state.tiling.tileType = "metro";
  const metro = calculateDraft4Estimate(state).sections.tiling;

  assert.ok(standard.fittingMinimum > 0);
  assert.ok(standard.fittingMaximum > standard.fittingMinimum);
  assert.ok(metro.fittingMinimum > standard.fittingMinimum);
  assert.ok(metro.fittingMaximum > standard.fittingMaximum);
});

test("bathroom, en-suite and cloakroom designs remain independent", () => {
  const store = createPlannerStore(memoryStorage());
  store.addFixture("bath");
  const bathroomObjectId = store.state.objects[0].id;
  store.state.room.width = 2.75;

  store.changeRoute("ensuite");
  assert.equal(store.state.route, "ensuite");
  assert.equal(store.state.objects.length, 0);
  assert.equal(store.state.room.width, 3.8);
  store.addFixture("wall-hung-toilet");
  const ensuiteObjectId = store.state.objects[0].id;

  store.changeRoute("cloakroom");
  assert.equal(store.state.objects.length, 0);
  store.addFixture("wall-mounted-basin");

  store.changeRoute("bathroom");
  assert.equal(store.state.room.width, 2.75);
  assert.equal(store.state.objects.length, 1);
  assert.equal(store.state.objects[0].id, bathroomObjectId);

  store.changeRoute("ensuite");
  assert.equal(store.state.objects.length, 1);
  assert.equal(store.state.objects[0].id, ensuiteObjectId);
});

test("product preview extracts a JSON-LD price and square-metre unit", () => {
  const html = `
    <html><head>
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Product",
          "name": "Warm Stone Porcelain Tile 600 x 600mm",
          "image": "https://retailer.example/tile.jpg",
          "offers": {"@type":"Offer","price":"39.95","priceCurrency":"GBP"}
        }
      </script>
    </head><body><p>£39.95 per m²</p></body></html>`;

  const result = extractProductData(html, "https://retailer.example/warm-stone-tile");
  assert.equal(result.ok, true);
  assert.equal(result.price, 39.95);
  assert.equal(result.currency, "GBP");
  assert.equal(result.unit, "sqm");
  assert.match(result.name, /Warm Stone/);
});

test("product preview falls back to product price metadata", () => {
  const html = `
    <html><head>
      <meta property="og:title" content="900mm Quadrant Enclosure">
      <meta property="product:price:amount" content="499.95">
      <meta property="product:price:currency" content="GBP">
    </head><body></body></html>`;
  const result = extractProductData(html, "https://retailer.example/quadrant");
  assert.equal(result.ok, true);
  assert.equal(result.price, 499.95);
  assert.equal(result.unit, "item");
});
