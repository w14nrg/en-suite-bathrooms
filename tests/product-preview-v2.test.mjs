import test from "node:test";
import assert from "node:assert/strict";
import { extractProductData } from "../functions/api/product-preview-v2.js";

test("Victorian Plumbing tile pages prefer the per-square-metre price over the box price", () => {
  const html = `
    <html><head><title>Stonehouse Studio Cosmos Parchment Hexagon Wall & Floor Tiles</title></head>
    <body>
      <h1>Stonehouse Studio Cosmos Parchment Hexagon Wall & Floor Tiles 225 x 225mm</h1>
      <div class="price-per-area">£45.40 /m<sup>2</sup></div>
      <div class="box-price">£39.95 per box</div>
    </body></html>`;

  const result = extractProductData(
    html,
    "https://www.victorianplumbing.co.uk/stonehouse-studio-cosmos-parchment-hexagon-wall-floor-tiles-225-x-225mm?preSelected=true&sku=COS-PAR",
  );

  assert.equal(result.ok, true);
  assert.equal(result.price, 45.4);
  assert.equal(result.unit, "sqm");
  assert.equal(result.source, "visible-sqm");
});

test("ordinary product pages still return their item price", () => {
  const html = `
    <html><head>
      <meta property="og:title" content="Bathroom tap">
      <meta property="product:price:amount" content="129.95">
      <meta property="product:price:currency" content="GBP">
    </head><body></body></html>`;
  const result = extractProductData(html, "https://retailer.example/tap");
  assert.equal(result.ok, true);
  assert.equal(result.price, 129.95);
  assert.equal(result.unit, "item");
});
