/**
 * Editable link-to-model rules. More-specific rules should appear first.
 * The estimator never treats URL classification as proof of dimensions or price.
 */
export const PRODUCT_LINK_RULES = [
  {
    id: "quadrant-enclosure",
    family: "quadrant-enclosure",
    keywords: ["quadrant enclosure", "quadrant shower", "offset quadrant"],
  },
  {
    id: "rectangular-enclosure",
    family: "rectangular-enclosure",
    keywords: ["rectangular enclosure", "rectangle enclosure"],
  },
  {
    id: "square-enclosure",
    family: "square-enclosure",
    keywords: ["square enclosure", "square shower"],
  },
  {
    id: "walk-in-screen",
    family: "walk-in-screen",
    keywords: ["walk in screen", "walk-in screen", "wetroom screen", "wet room screen"],
  },
  {
    id: "wall-hung-toilet",
    family: "wall-hung-toilet",
    keywords: ["wall hung toilet", "wall-hung toilet", "wall hung wc", "wall-hung wc"],
  },
  {
    id: "close-coupled-toilet",
    family: "close-coupled-toilet",
    keywords: ["close coupled toilet", "close-coupled toilet", "close coupled wc"],
  },
  {
    id: "back-to-wall-toilet",
    family: "back-to-wall-toilet",
    keywords: ["back to wall toilet", "back-to-wall toilet", "btw toilet"],
  },
  {
    id: "concealed-frame",
    family: "concealed-cistern-frame",
    keywords: ["concealed cistern", "toilet frame", "wc frame"],
  },
  {
    id: "vanity",
    family: "vanity-unit",
    keywords: ["vanity unit", "vanity basin", "basin unit"],
  },
  {
    id: "wall-basin",
    family: "wall-mounted-basin",
    keywords: ["wall mounted basin", "wall-mounted basin", "wall hung basin"],
  },
  {
    id: "freestanding-basin",
    family: "freestanding-basin",
    keywords: ["freestanding basin", "pedestal basin"],
  },
  {
    id: "shower-tray",
    family: "shower-tray",
    keywords: ["shower tray"],
  },
  {
    id: "bath",
    family: "bath",
    keywords: ["bath", "bathtub"],
  },
  {
    id: "basin-tap",
    family: "basin-tap",
    keywords: ["basin tap", "mixer tap"],
  },
  {
    id: "concealed-shower",
    family: "concealed-shower",
    keywords: ["concealed shower"],
  },
  {
    id: "exposed-shower",
    family: "exposed-shower",
    keywords: ["exposed shower", "shower column"],
  },
  {
    id: "towel-rail",
    family: "heated-towel-rail",
    keywords: ["towel rail", "towel radiator"],
  },
  {
    id: "mirror",
    family: "mirror",
    keywords: ["mirror", "mirrored cabinet"],
  },
];

export const RETAILER_RULES = [
  { host: "victorianplumbing.co.uk", retailer: "Victorian Plumbing" },
  { host: "victoriaplum.com", retailer: "Victoria Plum" },
  { host: "bathstore.com", retailer: "Bathstore" },
  { host: "drench.co.uk", retailer: "Drench" },
  { host: "sanctuary-bathrooms.co.uk", retailer: "Sanctuary Bathrooms" },
  { host: "tilemountain.co.uk", retailer: "Tile Mountain" },
  { host: "wallsandfloors.co.uk", retailer: "Walls and Floors" },
];

