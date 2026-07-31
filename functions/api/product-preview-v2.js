const HTML_LIMIT = 2_000_000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300",
      "access-control-allow-origin": "*",
    },
  });
}

function decodeHtml(value = "") {
  return String(value)
    .replace(/&pound;|&#163;|&#xA3;/gi, "£")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .trim();
}

function stripTags(value = "") {
  return decodeHtml(String(value).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ").replace(/\s+/g, " "));
}

function numberPrice(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const clean = String(value ?? "")
    .replace(/\s/g, "")
    .replace(/,/g, "")
    .replace(/[^0-9.]/g, "");
  const match = clean.match(/\d+(?:\.\d{1,2})?/);
  const parsed = match ? Number(match[0]) : NaN;
  return Number.isFinite(parsed) && parsed >= 0.01 && parsed <= 100000 ? parsed : null;
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

function linkHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
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
  if (value["@graph"]) {
    const found = findProductNode(value["@graph"]);
    if (found) return found;
  }
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
    if (price !== null) {
      return {
        price,
        currency: offer.priceCurrency || offer.priceSpecification?.priceCurrency || "GBP",
      };
    }
  }
  return { price: null, currency: "GBP" };
}

function jsonLdProduct(html) {
  const scripts = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of scripts) {
    const raw = decodeHtml(match[1]).trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const product = findProductNode(parsed);
      if (!product) continue;
      const offer = offerFromProduct(product);
      return {
        name: String(product.name || ""),
        image: Array.isArray(product.image)
          ? String(product.image[0] || "")
          : typeof product.image === "object"
            ? String(product.image.url || product.image.contentUrl || "")
            : String(product.image || ""),
        ...offer,
        source: "json-ld",
      };
    } catch {
      // Continue through the retailer fallbacks.
    }
  }
  return null;
}

function priceFromMeta(html) {
  const raw = metaContent(html, ["product:price:amount", "og:price:amount", "product.price.amount", "price"]);
  const price = numberPrice(raw);
  if (price === null) return null;
  return {
    price,
    currency: metaContent(html, ["product:price:currency", "og:price:currency", "priceCurrency"]) || "GBP",
    source: "meta",
  };
}

function priceFromItemprop(html) {
  const patterns = [
    /itemprop=["']price["'][^>]*(?:content|value)=["']([^"']+)["']/i,
    /(?:content|value)=["']([^"']+)["'][^>]*itemprop=["']price["']/i,
    /itemprop=["']price["'][^>]*>([^<]+)</i,
    /data-product-price=["']([^"']+)["']/i,
    /data-price-amount=["']([^"']+)["']/i,
    /data-price=["']([^"']+)["']/i,
  ];
  for (const pattern of patterns) {
    const price = numberPrice(html.match(pattern)?.[1]);
    if (price !== null) return { price, currency: "GBP", source: "itemprop" };
  }
  return null;
}

function explicitSquareMetrePrice(html) {
  const decoded = decodeHtml(html);
  const text = stripTags(html);
  const unit = String.raw`(?:m²|m2|m\^2|sq\.?\s*m|sqm|square\s*met(?:re|er)s?)`;
  const amount = String.raw`([0-9]{1,4}(?:[.,][0-9]{1,2})?)`;
  const patterns = [
    new RegExp(`£\\s*${amount}\\s*(?:/|per\\s*)${unit}`, "i"),
    new RegExp(`£\\s*${amount}\\s*${unit}`, "i"),
    new RegExp(`(?:price\\s*)?(?:per\\s*)${unit}[^£0-9]{0,50}£?\\s*${amount}`, "i"),
    new RegExp(`${unit}[^£0-9]{0,35}£\\s*${amount}`, "i"),
  ];
  for (const source of [text, decoded]) {
    for (const pattern of patterns) {
      const match = source.match(pattern);
      const price = numberPrice(match?.[1]);
      if (price !== null) return { price, currency: "GBP", unit: "sqm", source: "visible-sqm" };
    }
  }

  const keyPattern = /["'](?:pricePerSquareMet(?:re|er)|price_per_square_met(?:re|er)|pricePerSqm|price_per_sqm|pricePerM2|price_per_m2|sqmPrice|m2Price)["']\s*:\s*["']?([0-9]+(?:\.[0-9]{1,2})?)/i;
  const keyed = decoded.match(keyPattern);
  const keyedPrice = numberPrice(keyed?.[1]);
  return keyedPrice === null ? null : { price: keyedPrice, currency: "GBP", unit: "sqm", source: "script-sqm" };
}

function priceFromEmbeddedData(html) {
  const decoded = decodeHtml(html);
  const patterns = [
    /["'](?:salePrice|sellingPrice|currentPrice|finalPrice|displayPrice|unitPrice)["']\s*:\s*["']?£?\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
    /["']price["']\s*:\s*["']?£?\s*([0-9]+(?:\.[0-9]{1,2})?)["']?/i,
  ];
  for (const pattern of patterns) {
    const price = numberPrice(decoded.match(pattern)?.[1]);
    if (price !== null) return { price, currency: "GBP", source: "embedded-data" };
  }
  return null;
}

function priceFromVisibleText(html) {
  const text = stripTags(html).slice(0, 300000);
  const preferred = [
    /(?:now|sale\s*price|our\s*price|your\s*price|online\s*price|price)\s*:?\s*£\s*([0-9]{1,5}(?:[.,][0-9]{1,2})?)/i,
    /£\s*([0-9]{1,5}(?:[.,][0-9]{1,2})?)\s*(?:each|inc\.?\s*vat|including\s*vat)/i,
  ];
  for (const pattern of preferred) {
    const price = numberPrice(text.match(pattern)?.[1]);
    if (price !== null) return { price, currency: "GBP", source: "visible-price" };
  }
  return null;
}

function nearbyUnit(html, price) {
  const text = stripTags(html).toLowerCase();
  const values = [String(price), Number(price).toFixed(2), `£${Number(price).toFixed(2)}`, `£${String(price)}`];
  let index = -1;
  for (const value of values) {
    index = text.indexOf(value.toLowerCase());
    if (index >= 0) break;
  }
  const neighbourhood = index >= 0 ? text.slice(Math.max(0, index - 110), index + 190) : text.slice(0, 25000);
  if (/per\s*(?:m²|m2|sq\.?\s*m|sqm|square\s*met(?:re|er))|\/(?:m²|m2|sqm)/i.test(neighbourhood)) return "sqm";
  if (/per\s*box|\/box/i.test(neighbourhood)) return "box";
  if (/per\s*tile|\/tile/i.test(neighbourhood)) return "tile";
  if (/per\s*pack|\/pack/i.test(neighbourhood)) return "pack";
  return "item";
}

export function extractProductData(html, url = "") {
  const cleanHtml = String(html || "").slice(0, HTML_LIMIT);
  const sqm = explicitSquareMetrePrice(cleanHtml);
  const structured = jsonLdProduct(cleanHtml);
  const standard = priceFromMeta(cleanHtml) || priceFromItemprop(cleanHtml) || priceFromEmbeddedData(cleanHtml) || priceFromVisibleText(cleanHtml);
  const selected = sqm || (structured?.price !== null && structured?.price !== undefined ? structured : standard);

  if (!selected || selected.price === null) {
    return { ok: false, message: "No displayed product price was found on that page.", retailer: linkHost(url) };
  }

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

export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  const targetValue = requestUrl.searchParams.get("url") || "";
  let target;
  try {
    target = new URL(targetValue);
  } catch {
    return json({ ok: false, message: "A complete retailer URL is required." }, 400);
  }

  if (!["http:", "https:"].includes(target.protocol) || isBlockedHost(target.hostname)) {
    return json({ ok: false, message: "That retailer URL cannot be accessed." }, 400);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(target.toString(), {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 Chrome/151.0.0.0 Mobile Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/json;q=0.8,*/*;q=0.5",
        "accept-language": "en-GB,en;q=0.9",
        referer: `${target.protocol}//${target.host}/`,
      },
    });

    if (!response.ok) {
      return json({ ok: false, message: `The retailer returned ${response.status}. Enter the displayed price manually.` }, 422);
    }

    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/html") && !type.includes("application/xhtml+xml")) {
      return json({ ok: false, message: "The retailer did not return a readable product page." }, 422);
    }

    const html = (await response.text()).slice(0, HTML_LIMIT);
    const result = extractProductData(html, response.url || target.toString());
    return json(result, result.ok ? 200 : 422);
  } catch (error) {
    return json({
      ok: false,
      message: error?.name === "AbortError"
        ? "The retailer took too long to respond. Enter the displayed price manually."
        : "The retailer page could not be read. Enter the displayed price manually.",
    }, 422);
  } finally {
    clearTimeout(timeout);
  }
}
