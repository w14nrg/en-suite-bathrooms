import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const estimatorPath = resolve(root, "estimator", "index.html");
const estimator = readFileSync(estimatorPath, "utf8");
const siteJs = readFileSync(resolve(root, "assets", "js", "site.js"), "utf8");
const estimatorFixes = readFileSync(resolve(root, "assets", "js", "estimator-fixes.mjs"), "utf8");
const estimatorReader = readFileSync(resolve(root, "assets", "js", "estimator-reader.mjs"), "utf8");

test("the /estimator route exposes the Draft 4 room and price estimator", () => {
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

test("legacy planner URLs permanently lead to the estimator", () => {
  const redirects = readFileSync(resolve(root, "_redirects"), "utf8");
  assert.match(redirects, /^\/planner\.html\s+\/estimator\/\s+301/m);
  assert.match(redirects, /^\/planner\s+\/estimator\/\s+301/m);

  const plannerPath = resolve(root, "planner.html");
  assert.ok(existsSync(plannerPath), "A physical fallback redirect exists for hosts that ignore _redirects");
  const planner = readFileSync(plannerPath, "utf8");
  assert.match(planner, /url=\/estimator\//i);
  assert.match(planner, /location\.replace\(["']\/estimator\//i);
});

test("the shared site script replaces old planner links and loads only the custom live helper", () => {
  assert.match(siteJs, /function rewritePlannerLinks/);
  assert.match(siteJs, /Bathroom Estimator/);
  assert.match(siteJs, /en-suite-bathrooms\.nicholas-griffith-uk\.workers\.dev/);
  assert.match(siteJs, /\/widget\.js/);
  assert.match(siteJs, /TAWK_PATTERN/);
  assert.match(siteJs, /loadEstimatorFixes/);
});

test("the estimator has its compact contextual AI assistant and automatic link checks", () => {
  assert.match(estimatorFixes, /Need help with your estimate\?/);
  assert.match(estimatorFixes, /Bathroom Assistant/);
  assert.match(estimatorFixes, /en-suites-bathroom-ai\.nicholas-griffith-uk\.workers\.dev/);
  assert.match(estimatorFixes, /productsAndFittings/);
  assert.match(estimatorFixes, /addEventListener\("paste"/);
  assert.match(estimatorFixes, /estimator-reader\.mjs/);
  assert.match(estimatorReader, /Price found: £\$\{displayed\} per m²/);
  assert.match(estimatorReader, /https:\/\/r\.jina\.ai\//);
});

test("the estimator remains in the sitemap and all local assets exist", () => {
  const sitemap = readFileSync(resolve(root, "sitemap.xml"), "utf8");
  assert.match(sitemap, /https:\/\/www\.en-suite\.co\.uk\/estimator\//);
  assert.doesNotMatch(sitemap, /https:\/\/www\.en-suite\.co\.uk\/planner\.html/);

  const references = [...estimator.matchAll(/(?:href|src)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((value) => !value.startsWith("http") && !value.startsWith("tel:") && !value.startsWith("mailto:") && !value.startsWith("#"));

  for (const reference of references) {
    const localPath = resolve(dirname(estimatorPath), reference.split("#")[0]);
    assert.ok(existsSync(localPath), `Missing local estimator asset: ${reference}`);
  }
});
