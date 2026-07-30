/**
 * Pricing configuration.
 *
 * Published guides are copied from price-guide.html. Breakdown weights are
 * planning allocations within those guides, not contractor quotes. Product and
 * tile prices are only included after the customer enters or imports them.
 */
export const PRICING_CONFIG = {
  currency: "GBP",
  publishedSource: "price-guide.html",
  lastReviewed: "2026-07-30",
  routes: {
    existing: {
      label: "Existing bathroom or en-suite",
      publishedGuide: "From around £9,000+",
      minimum: 9000,
      maximum: null,
      distribution: {
        products: 0,
        removal: 0.11,
        plumbing: 0.17,
        partition: 0,
        waterproofing: 0.09,
        tiling: 0.16,
        electrical: 0.08,
        installation: 0.25,
        finishing: 0.08,
        unconfirmed: 0.06,
      },
    },
    newEnsuite: {
      label: "Brand-new en-suite",
      publishedGuide: "Often £12,000–£18,000+",
      minimum: 12000,
      maximum: 18000,
      distribution: {
        products: 0,
        removal: 0.04,
        plumbing: 0.18,
        partition: 0.15,
        waterproofing: 0.08,
        tiling: 0.13,
        electrical: 0.09,
        installation: 0.22,
        finishing: 0.06,
        unconfirmed: 0.05,
      },
    },
    cloakroom: {
      label: "Cloakroom",
      publishedGuide: "Survey required",
      minimum: null,
      maximum: null,
      distribution: {},
    },
  },
  serviceMultipliers: {
    "Likely straightforward": 1,
    "Possible but requires alteration": 1.18,
    "Survey required": 1.35,
    "Current arrangement appears impractical": 1.65,
  },
  tileWastageDefault: 10,
};

export const ESTIMATE_SECTIONS = [
  { id: "products", label: "Selected products" },
  { id: "removal", label: "Removal and preparation" },
  { id: "plumbing", label: "Plumbing and drainage" },
  { id: "partition", label: "Partition construction" },
  { id: "waterproofing", label: "Waterproofing" },
  { id: "tiling", label: "Tiling" },
  { id: "electrical", label: "Electrical and ventilation" },
  { id: "installation", label: "Installation" },
  { id: "finishing", label: "Waste removal and finishing" },
  { id: "unconfirmed", label: "Unconfirmed / survey-dependent" },
];

