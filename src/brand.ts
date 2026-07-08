export type BrandKey = "rmwapps" | "zonaloket" | "loketkuota" | "rmwindonesia";

export const BRAND_THEMES: Record<BrandKey, Record<string, string>> = {
  rmwapps: {
    "50": "229,246,253",
    "100": "204,236,252",
    "200": "153,215,247",
    "300": "102,194,242",
    "400": "51,171,225",
    "500": "0,148,208",
    "600": "0,126,177",
    "700": "0,104,146",
    "800": "0,82,115",
    "900": "0,60,84",
  },
  zonaloket: {
    "50": "254,226,226",
    "100": "252,202,202",
    "200": "249,150,150",
    "300": "246,99,99",
    "400": "227,59,49",
    "500": "208,19,0",
    "600": "177,16,0",
    "700": "146,13,0",
    "800": "115,10,0",
    "900": "84,7,0",
  },
  loketkuota: {
    "50": "229,247,254",
    "100": "204,239,253",
    "200": "153,222,250",
    "300": "102,205,248",
    "400": "51,185,245",
    "500": "0,189,242",
    "600": "0,161,206",
    "700": "0,133,170",
    "800": "0,105,134",
    "900": "0,77,98",
  },
  rmwindonesia: {
    "50": "245,234,255",
    "100": "235,214,255",
    "200": "215,173,255",
    "300": "195,132,255",
    "400": "175,91,255",
    "500": "139,42,255",
    "600": "118,36,217",
    "700": "97,30,179",
    "800": "76,24,141",
    "900": "55,18,103",
  },
};

/** APK display name for each brand */
export const BRAND_APK_NAME: Record<BrandKey, string> = {
  rmwapps: "RMW Apps",
  zonaloket: "Zona Loket Kuota",
  rmwindonesia: "RMW Indonesia",
  loketkuota: "Loket Kuota",
};

/** Primary hex color for each brand (used for spinner, etc.) */
export const BRAND_PRIMARY_HEX: Record<BrandKey, string> = {
  rmwapps: "#0094d0",
  zonaloket: "#d01300",
  loketkuota: "#00bdf2",
  rmwindonesia: "#8b2aff",
};

export function detectBrand(): BrandKey {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("brand") as BrandKey | null;
  if (fromQuery && fromQuery in BRAND_THEMES) return fromQuery;

  const segment = window.location.pathname
    .split("/")
    .filter(Boolean)[0]
    ?.toLowerCase() as BrandKey | undefined;
  if (segment && segment in BRAND_THEMES) return segment;

  return "rmwapps";
}

export function setFavicon(brand: BrandKey): void {
  const existing = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (existing) {
    existing.href = `/${brand}.png`;
  } else {
    const link = document.createElement("link");
    link.rel = "icon";
    link.href = `/${brand}.png`;
    document.head.appendChild(link);
  }
}

export function buildThemeCSS(brand: BrandKey): string {
  const colors = BRAND_THEMES[brand];
  let css = ".crisp-client {\n";
  for (const [level, rgb] of Object.entries(colors)) {
    css += `  --crisp-color-theme-${level}: ${rgb} !important;\n`;
  }
  css += "}";
  return css;
}
