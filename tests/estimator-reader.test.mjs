import test from "node:test";
import assert from "node:assert/strict";
import { extractReaderPrice } from "../assets/js/estimator-reader.mjs";

const victorianUrl = "https://www.victorianplumbing.co.uk/stonehouse-studio-cosmos-parchment-hexagon-wall-floor-tiles-225-x-225mm?preSelected=true&sku=COS-PAR";

test("the browser reader takes Victorian Plumbing's square-metre price, not its box price", () => {
  const readerText = `
Title: Stonehouse Studio Cosmos Parchment Hexagon Wall & Floor Tiles 225 x 225mm

# Stonehouse Studio Cosmos Parchment Hexagon Wall & Floor Tiles

£45.40 /m²

£39.95 per box
`;
  const result = extractReaderPrice(readerText, victorianUrl);
  assert.equal(result.ok, true);
  assert.equal(result.price, 45.4);
  assert.equal(result.unit, "sqm");
  assert.equal(result.source, "reader-sqm");
});

test("the browser reader still extracts an ordinary item price", () => {
  const result = extractReaderPrice("Title: Basin tap\n\nOnline price: £129.95", "https://shop.example/basin-tap");
  assert.equal(result.ok, true);
  assert.equal(result.price, 129.95);
  assert.equal(result.unit, "item");
});
