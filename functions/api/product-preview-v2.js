const HTML_LIMIT = 2_000_000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}

function decodeHtml(value = "") {
  return String(value)
    .replace(/&pound;|&#163;|&#xA3;/gi, "£")
    .replace(/&sup2;|&#178;|&#xB2;/gi, "²")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .trim();
}

function normaliseUnitMarkup(value = "") {
  return decodeHtml(value)
    .replace(/m\s*<sup[^>]*>\s*2\s*<\/sup>/gi, "m²")
    .replace(/m\s*<span[^>]*>\s*2\s*<\/span>/gi, "m²")
    .replace(/m\s*\^\s*2/gi, "m²");
}

function stripTags(value = "") {
  return normaliseUnitMarkup(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function numberPrice(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const clean = String(value ?? "").replace(/\s/g, "").replace(/,/g, "").replace(/[^0-9.]/g, "");
  const match = clean.match(/\d+(?:\.\d{1,2})?/);
  const price = match ? Number(match[0]) : NaN;
  return Number.isFinite(price) && price >= 0.01 && price <= 100000 ? price : null;
}

function linkHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function metaContent(html, keys) {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name|itemprop)=["']${escaped}["'][^>]*>`, "i"),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return decodeHtml(match[1]);
    }
  }
  return "";
}

function titleFromHtml(html) {
  return metaContent(html, ["og:title", "twitter:title"]) || stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
}

function imageFromHtml(html) {
  return metaContent(html, ["og:image", "twitter:image", "image"]);
}

function findProductNode(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findProductNode(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
  if (types.some((type) => String(type).toLowerCase() === "product")) return value;
  for (const child of Object.values(value)) {
    if (child && typeof child === "object") {
      const found = findProductNode(child);
      if (found) return found;
    }
  }
  return null;
}

function offerFromProduct(product) {
  const offers = Array.isArray(product?.offers) ? product.offers : [product?.offers];
  for (const offer of offers.filter(Boolean)) {
    const price = numberPrice(offer.price) ?? numberPrice(offer.lowPrice) ?? numberPrice(offer.priceSpecification?.price);
    if (price !== null) return { price, currency: offer.priceCurrency || offer.priceSpecification?.priceCurrency || "GBP" };
  }
  return { price: null, currency: "GBP" };
}

function jsonLdProduct(html) {
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const product = findProductNode(JSON.parse(decodeHtml(match[1])));
      if (!product) continue;
      return {
        name: String(product.name || ""),
        image: Array.isArray(product.image)
          ? String(product.image[0] || "")
          : typeof product.image === "object"
            ? String(product.image.url || product.image.contentUrl || "")
            : String(product.image || ""),
        ...offerFromProduct(product),
        source: "json-ld",
      };
    } catch {
      // Retailer JSON-LD is often malformed; continue to visible page data.
    }
  }
  return null;
}

function explicitSquareMetrePrice(html) {
  const sources = [stripTags(html), normaliseUnitMarkup(html)];
  const amount = String.raw`([0-9]{1,5}(?:[.,][0-9]{1,2})?)`;
  const unit = String.raw`(?:m\s*²|m\s*2|m2|sq\.?\s*m|sqm|square\s*met(?:re|er)s?)`;
  const patterns = [
    new RegExp(`£\\s*${amount}\\s*(?:/|per\\s*)\\s*${unit}`, "i"),
    new RegExp(`£\\s*${amount}\\s*${unit}`, "i"),
    new RegExp(`(?:price\\s*)?(?:per\\s*)${unit}[^£0-9]{0,60}£?\\s*${amount}`, "i"),
    new RegExp(`${unit}[^£0-9]{0,45}£\\s*${amount}`, "i"),
  ];

  for (const source of sources) {
    for (const pattern of patterns) {
      const price = numberPrice(source.match(pattern)?.[1]);
      if (price !== null) return { price, currency: "GBP", unit: "sqm", source: "visible-sqm" };
    }
  }

  const embeddedPatterns = [
    /["'](?:pricePerSquareMet(?:re|er)|price_per_square_met(?:re|er)|pricePerSqm|price_per_sqm|pricePerM2|price_per_m2|sqmPrice|m2Price)["']\s*:\s*["']?£?\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
    /["'](?:pricePerUnit)["']\s*:\s*["']?£?\s*([0-9]+(?:\.[0-9]{1,2})?)["']?[^}]{0,120}["'](?:unit|unitOfMeasure)["']\s*:\s*["'](?:m2|sqm|m²)["']/i,
  ];
  const decoded = normaliseUnitMarkup(html);
  for (const pattern of embeddedPatterns) {
    const price = numberPrice(decoded.match(pattern)?.[1]);
    if (price !== null) return { price, currency: "GBP", unit: "sqm", source: "script-sqm" };
  }
  return null;
}

function genericPrice(html) {
  const structured = jsonLdProduct(html);
  if (structured?.price !== null && structured?.price !== undefined) return structured;

  const metaPrice = numberPrice(metaContent(html, ["product:price:amount", "og:price:amount", "product.price.amount", "price"]));
  if (metaPrice !== null) return { price: metaPrice, currency: metaContent(html, ["product:price:currency", "og:price:currency", "priceCurrency"]) || "GBP", source: "meta" };

  const patterns = [
    /itemprop=["']price["'][^>]*(?:content|value)=["']([^"']+)["']/i,
    /(?:content|value)=["']([^"']+)["'][^>]*itemprop=["']price["']/i,
    /data-product-price=["']([^"']+)["']/i,
    /data-price-amount=["']([^"']+)["']/i,
    /(?:now|sale\s*price|our\s*price|online\s*price|price)\s*:?\s*£\s*([0-9]{1,5}(?:[.,][0-9]{1,2})?)/i,
  ];
  const text = stripTags(html).slice(0, 350000);
  for (const pattern of patterns) {
    const price = numberPrice((html.match(pattern) || text.match(pattern))?.[1]);
    if (price !== null) return { price, currency: "GBP", source: "page" };
  }
  return null;
}

function nearbyUnit(html, price) {
  const text = stripTags(html).toLowerCase();
  const values = [String(price), Number(price).toFixed(2), `£${Number(price).toFixed(2)}`, `£${price}`];
  let index = values.map((value) => text.indexOf(value.toLowerCase())).find((value) => value >= 0) ?? -1;
  const area = index >= 0 ? text.slice(Math.max(0, index - 120), index + 220) : text.slice(0, 25000);
  if (/(?:per|\/)\s*(?:m\s*²|m\s*2|m2|sqm|square\s*met(?:re|er))/i.test(area)) return "sqm";
  if (/(?:per|\/)\s*box/i.test(area)) return "box";
  if (/(?:per|\/)\s*tile/i.test(area)) return "tile";
  if (/(?:per|\/)\s*pack/i.test(area)) return "pack";
  return "item";
}

export function extractProductData(html, url = "") {
  const cleanHtml = String(html || "").slice(0, HTML_LIMIT);
  const sqm = explicitSquareMetrePrice(cleanHtml);
  const standard = genericPrice(cleanHtml);
  const selected = sqm || standard;
  const structured = jsonLdProduct(cleanHtml);

  if (!selected || selected.price === null) return { ok: false, message: "No displayed product price was found on that page.", retailer: linkHost(url) };

  const price = Number(selected.price);
  return {
    ok: true,
    price,
    currency: String(selected.currency || structured?.currency || "GBP").toUpperCase(),
    name: structured?.name || titleFromHtml(cleanHtml),
    image: structured?.image || imageFromHtml(cleanHtml),
    retailer: linkHost(url),
    unit: selected.unit || nearbyUnit(cleanHtml, price),
    source: selected.source || "page",
  };
}

function isBlockedHost(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (/^(?:0|10|127|169\.254|192\.168)\./.test(host)) return true;
  const private172 = host.match(/^172\.(\d{1,3})\./);
  if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return true;
  if (/^\[?(?:fc|fd|fe80):/i.test(host) || host === "::1") return true;
  return false;
}

async function fetchRetailer(target, signal) {
  return fetch(target.toString(), {
    redirect: "follow",
    signal,
    headers: {
      "user-agent": "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 Chrome/151.0.0.0 Mobile Safari/537.36",
      accept: "text/html,application/xhtml+xml,*/*;q=0.7",
      "accept-language": "en-GB,en;q=0.9",
      referer: `${target.protocol}//${target.host}/`,
    },
  });
}

async function readerFallback(target, signal) {
  const readerUrl = `https://r.jina.ai/http://${target.host}${target.pathname}${target.search}`;
  const response = await fetch(readerUrl, { signal, headers: { accept: "text/plain", "user-agent": "EnSuitesEstimator/1.0" } });
  if (!response.ok) return null;
  return (await response.text()).slice(0, HTML_LIMIT);
}

export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  let target;
  try {
    target = new URL(requestUrl.searchParams.get("url") || "");
  } catch {
    return json({ ok: false, message: "A complete retailer URL is required." }, 400);
  }
  if (!["http:", "https:"].includes(target.protocol) || isBlockedHost(target.hostname)) return json({ ok: false, message: "That retailer URL cannot be accessed." }, 400);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 14000);
  try {
    let html = "";
    let finalUrl = target.toString();
    try {
      const response = await fetchRetailer(target, controller.signal);
      if (response.ok && /text\/html|application\/xhtml\+xml/i.test(response.headers.get("content-type") || "")) {
        html = (await response.text()).slice(0, HTML_LIMIT);
        finalUrl = response.url || finalUrl;
      }
    } catch {
      // Some retailers block server-side requests; use the reader fallback below.
    }

    let result = html ? extractProductData(html, finalUrl) : { ok: false };
    if (!result.ok || (linkHost(target.toString()).includes("victorianplumbing") && result.unit !== "sqm" && /tile/i.test(result.name || target.pathname))) {
      const fallback = await readerFallback(target, controller.signal);
      if (fallback) {
        const fallbackResult = extractProductData(fallback, target.toString());
        if (fallbackResult.ok) result = fallbackResult;
      }
    }

    if (!result.ok) return json({ ok: false, message: "The retailer page did not expose a reliable displayed price. Enter it manually.", retailer: linkHost(target.toString()) }, 422);
    return json(result, 200);
  } catch (error) {
    return json({ ok: false, message: error?.name === "AbortError" ? "The retailer took too long to respond. Enter the displayed price manually." : "The retailer page could not be read. Enter the displayed price manually." }, 422);
  } finally {
    clearTimeout(timeout);
  }
}
