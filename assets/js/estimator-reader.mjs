const previousFetch = window.fetch.bind(window);
const READER_PREFIX = "https://r.jina.ai/";
const PRODUCT_WORKER = "https://en-suites-bathroom-ai.nicholas-griffith-uk.workers.dev/product";

function requestUrl(input) {
  try {
    if (input instanceof Request) return new URL(input.url, location.href);
    return new URL(String(input), location.href);
  } catch {
    return null;
  }
}

function money(value) {
  const cleaned = String(value || "").replace(/,/g, "").replace(/[^0-9.]/g, "");
  const match = cleaned.match(/\d+(?:\.\d{1,2})?/);
  const number = match ? Number(match[0]) : NaN;
  return Number.isFinite(number) && number >= 0.01 && number < 100000 ? number : null;
}

function retailerName(target) {
  try {
    return new URL(target).hostname.replace(/^www\./, "");
  } catch {
    return "Retailer";
  }
}

function pageTitle(text, target) {
  const labelled = text.match(/^Title:\s*(.+)$/im)?.[1]?.trim();
  if (labelled) return labelled;
  const heading = text.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading;
  try {
    return decodeURIComponent(new URL(target).pathname.split("/").filter(Boolean).pop() || "Product")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  } catch {
    return "Product";
  }
}

export function extractReaderPrice(text, target = "") {
  const content = String(text || "")
    .replace(/&pound;|&#163;|&#xA3;/gi, "£")
    .replace(/&sup2;|&#178;|&#xB2;/gi, "²")
    .replace(/m\s*\^\s*2/gi, "m²");

  const amount = String.raw`([0-9]{1,5}(?:[.,][0-9]{1,2})?)`;
  const sqm = String.raw`(?:m\s*²|m\s*2|m2|sqm|sq\.?\s*m|square\s*met(?:re|er)s?)`;
  const sqmPatterns = [
    new RegExp(`£\\s*${amount}\\s*(?:\\/|per\\s*)\\s*${sqm}`, "i"),
    new RegExp(`£\\s*${amount}\\s*${sqm}`, "i"),
    new RegExp(`(?:price\\s*)?(?:per\\s*)${sqm}[^£0-9]{0,80}£?\\s*${amount}`, "i"),
    new RegExp(`${sqm}[^£0-9]{0,60}£\\s*${amount}`, "i"),
  ];

  for (const pattern of sqmPatterns) {
    const price = money(content.match(pattern)?.[1]);
    if (price !== null) {
      return {
        ok: true,
        price,
        currency: "GBP",
        unit: "sqm",
        name: pageTitle(content, target),
        retailer: retailerName(target),
        source: "reader-sqm",
      };
    }
  }

  const pricePatterns = [
    /(?:now|sale\s*price|our\s*price|online\s*price|price)\s*:?\s*£\s*([0-9]{1,5}(?:[.,][0-9]{1,2})?)/i,
    /£\s*([0-9]{1,5}(?:[.,][0-9]{1,2})?)/i,
  ];
  for (const pattern of pricePatterns) {
    const price = money(content.match(pattern)?.[1]);
    if (price !== null) {
      return {
        ok: true,
        price,
        currency: "GBP",
        unit: "item",
        name: pageTitle(content, target),
        retailer: retailerName(target),
        source: "reader-item",
      };
    }
  }

  return {
    ok: false,
    message: "The retailer page did not expose a reliable displayed price.",
    retailer: retailerName(target),
  };
}

async function readerPreview(target) {
  const response = await previousFetch(`${READER_PREFIX}${target}`, {
    headers: { Accept: "text/plain" },
  });
  if (!response.ok) throw new Error(`Reader returned ${response.status}`);
  return extractReaderPrice(await response.text(), target);
}

async function workerPreview(target) {
  const response = await previousFetch(PRODUCT_WORKER, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: target }),
  });
  const data = await response.json();
  const product = data?.product || data;
  const price = money(product?.price);
  if (!response.ok || price === null) throw new Error(data?.error || "No price found");
  return {
    ok: true,
    price,
    currency: product.currency || "GBP",
    unit: product.unit || "item",
    name: product.name || product.title || pageTitle("", target),
    image: product.image || "",
    retailer: product.retailer || retailerName(target),
    source: "product-worker",
  };
}

function responseFor(data) {
  return new Response(JSON.stringify(data), {
    status: data.ok ? 200 : 422,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function updateTileUi(target, data) {
  const link = document.querySelector("#tileLink");
  if (!link || link.value.trim() !== target) return;
  const found = document.querySelector("#tilePriceFound");
  const manual = document.querySelector("#tileManualPrice");
  const input = document.querySelector("#tilePrice");
  if (data.ok && data.unit === "sqm" && Number.isFinite(Number(data.price))) {
    const displayed = Number(data.price).toFixed(2);
    if (input) {
      input.value = displayed;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (found) {
      found.textContent = `Price found: £${displayed} per m²`;
      found.hidden = false;
    }
    if (manual) manual.hidden = true;
  } else {
    if (found) found.hidden = true;
    if (manual) manual.hidden = false;
  }
}

window.fetch = async function githubPagesEstimatorFetch(input, init) {
  const url = requestUrl(input);
  if (!url || !url.pathname.endsWith("/api/product-preview")) return previousFetch(input, init);

  const target = url.searchParams.get("url") || "";
  let data;
  try {
    data = await readerPreview(target);
    if (!data.ok) throw new Error(data.message);
  } catch {
    try {
      data = await workerPreview(target);
    } catch {
      data = {
        ok: false,
        message: "The price could not be read automatically. Enter the displayed retailer price below.",
        retailer: retailerName(target),
      };
    }
  }

  requestAnimationFrame(() => updateTileUi(target, data));
  return responseFor(data);
};
