import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const estimatorPath = resolve(root, "estimator", "index.html");
const estimator = readFileSync(estimatorPath, "utf8");

test("the /estimator route exposes the simplified Draft 4 planner", () => {
  assert.match(estimator, /Planner · Draft 4/);
  assert.match(estimator, /data-route="bathroom"/);
  assert.match(estimator, /data-route="ensuite"/);
  assert.match(estimator, /data-route="cloakroom"/);
  assert.match(estimator, /id="drawWall"/);
  assert.match(estimator, /id="productUrl"/);
  assert.match(estimator, /id="productManualPrice"/);
  assert.match(estimator, /id="currentBathroomPhoto"/);
  assert.match(estimator, /id="wallCoverage"/);
  assert.match(estimator, /id="floorIncluded"/);
  assert.match(estimator, /id="tileType"/);
  assert.match(estimator, /id="wallSqm"/);
  assert.match(estimator, /id="floorSqm"/);
  assert.match(estimator, /id="tileLink"/);
  assert.match(estimator, /id="tileManualPrice"/);
  assert.match(estimator, /id="rotate3d"/);
  assert.match(estimator, /id="estimateTotal"/);
  assert.match(estimator, /data-view="2d"/);
  assert.match(estimator, /data-view="3d"/);
  assert.match(estimator, /three@0\.185\.1/);
  assert.match(estimator, /estimator-draft4\.css/);
  assert.match(estimator, /estimator-simple\.mjs/);
  assert.doesNotMatch(estimator, /id="serviceList"/);
  assert.doesNotMatch(estimator, /Known services/);
  assert.doesNotMatch(estimator, /£60\/m²/);
});

test("the existing AI planner remains a normal working page without a redirect", () => {
  const planner = readFileSync(resolve(root, "planner.html"), "utf8");
  assert.match(planner, /AI Bathroom Planner/);
  assert.doesNotMatch(planner, /http-equiv=["']refresh/i);
  assert.doesNotMatch(planner, /location\.(?:href|replace).*estimator/i);
});

test("the estimator keeps the existing chat integration and is in the sitemap", () => {
  assert.match(estimator, /6a2161974a36f41c2edf02c6\/1jq96ae0j/);
  const sitemap = readFileSync(resolve(root, "sitemap.xml"), "utf8");
  assert.match(sitemap, /https:\/\/www\.en-suite\.co\.uk\/estimator\//);

  const htmlPages = readdirSync(root).filter((name) => name.endsWith(".html"));
  for (const page of htmlPages) {
    const html = readFileSync(resolve(root, page), "utf8");
    assert.match(html, /6a2161974a36f41c2edf02c6\/1jq96ae0j/, `${page} keeps Tawk chat`);
  }
});

test("all local assets referenced by the estimator exist", () => {
  const references = [...estimator.matchAll(/(?:href|src)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter(
      (value) =>
        !value.startsWith("http") &&
        !value.startsWith("tel:") &&
        !value.startsWith("mailto:") &&
        !value.startsWith("#"),
    );

  for (const reference of references) {
    const localPath = resolve(dirname(estimatorPath), reference.split("#")[0]);
    assert.ok(existsSync(localPath), `Missing local estimator asset: ${reference}`);
  }
});
