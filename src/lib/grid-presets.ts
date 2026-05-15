// Mirror of backend GRID_PRESETS from katechon-backend/src/core/channels/spec.ts.
// Used by the frontend renderer to know each preset's grid-template strings and
// to dispatch components by their region's kind. Must stay in sync with the
// backend file — drift will cause the renderer to lay out a spec the agent
// thinks is valid.

export type GridTemplateId =
  | "single"
  | "broadcast"
  | "terminal"
  | "news-stack"
  | "split";

export type RegionKind =
  | "main"
  | "strip"
  | "sidebar"
  | "ticker"
  | "layer-bg"
  | "layer-fg";

export interface GridPresetArea {
  name: string;
  kind: RegionKind;
}

export interface GridPreset {
  id: GridTemplateId;
  description: string;
  templateAreas: string[];
  templateRows: string;
  templateColumns: string;
  areas: GridPresetArea[];
}

export const GRID_PRESETS: GridPreset[] = [
  {
    id: "single",
    description: "Single full-bleed surface.",
    templateAreas: ["main"],
    templateRows: "1fr",
    templateColumns: "1fr",
    areas: [
      { name: "main", kind: "main" },
      { name: "bg", kind: "layer-bg" },
      { name: "fg", kind: "layer-fg" },
    ],
  },
  {
    id: "broadcast",
    description: "TV-broadcast vertical stack.",
    templateAreas: ["header", "main", "lower-third", "ticker"],
    templateRows: "auto 1fr auto auto",
    templateColumns: "1fr",
    areas: [
      { name: "header", kind: "strip" },
      { name: "main", kind: "main" },
      { name: "lower-third", kind: "strip" },
      { name: "ticker", kind: "ticker" },
      { name: "bg", kind: "layer-bg" },
      { name: "fg", kind: "layer-fg" },
    ],
  },
  {
    id: "terminal",
    description: "Trading terminal.",
    templateAreas: [
      "header header header",
      "left main right",
      "bottom bottom bottom",
    ],
    templateRows: "auto 1fr auto",
    templateColumns: "240px 1fr 320px",
    areas: [
      { name: "header", kind: "strip" },
      { name: "left", kind: "sidebar" },
      { name: "main", kind: "main" },
      { name: "right", kind: "sidebar" },
      { name: "bottom", kind: "strip" },
      { name: "bg", kind: "layer-bg" },
      { name: "fg", kind: "layer-fg" },
    ],
  },
  {
    id: "news-stack",
    description: "News channel with side panel and ticker.",
    templateAreas: ["header header", "main aside", "ticker ticker"],
    templateRows: "auto 1fr auto",
    templateColumns: "1fr 320px",
    areas: [
      { name: "header", kind: "strip" },
      { name: "main", kind: "main" },
      { name: "aside", kind: "sidebar" },
      { name: "ticker", kind: "ticker" },
      { name: "bg", kind: "layer-bg" },
      { name: "fg", kind: "layer-fg" },
    ],
  },
  {
    id: "split",
    description: "Two equal panels.",
    templateAreas: ["left right"],
    templateRows: "1fr",
    templateColumns: "1fr 1fr",
    areas: [
      { name: "left", kind: "main" },
      { name: "right", kind: "main" },
      { name: "bg", kind: "layer-bg" },
      { name: "fg", kind: "layer-fg" },
    ],
  },
];

export function getGridPreset(id: GridTemplateId): GridPreset | undefined {
  return GRID_PRESETS.find((p) => p.id === id);
}

export function getRegionKind(
  presetId: GridTemplateId,
  areaName: string,
): RegionKind | null {
  const preset = getGridPreset(presetId);
  if (!preset) return null;
  return preset.areas.find((a) => a.name === areaName)?.kind ?? null;
}
