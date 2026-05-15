"use client";

import { createElement, Suspense } from "react";
import type { Channel, ChannelRegion } from "@/lib/types";
import {
  getGridPreset,
  type GridPreset,
  type GridPresetArea,
  type RegionKind,
} from "@/lib/grid-presets";
import { resolveRegionComponent } from "./component-registry";

interface ChannelGridProps {
  channel: Channel;
}

export function ChannelGrid({ channel }: ChannelGridProps) {
  const ui = channel.spec.ui;
  const preset = getGridPreset(ui.gridTemplate);
  if (!preset) {
    return (
      <div className="grid h-full place-items-center text-sm text-red-300">
        Unknown grid template: {ui.gridTemplate}
      </div>
    );
  }

  const bg = ui.regions?.bg;
  const fg = ui.regions?.fg;

  return (
    <div className="relative h-full w-full overflow-hidden">
      {bg ? <LayerBg region={bg} channel={channel} /> : null}
      <GridSurface preset={preset} regions={ui.regions} channel={channel} gap={ui.gap} />
      {fg ? <LayerFg region={fg} channel={channel} /> : null}
    </div>
  );
}

function GridSurface({
  preset,
  regions,
  channel,
  gap,
}: {
  preset: GridPreset;
  regions: Record<string, ChannelRegion>;
  channel: Channel;
  gap?: string;
}) {
  const gridStyle: React.CSSProperties = {
    display: "grid",
    height: "100%",
    width: "100%",
    gridTemplateAreas: preset.templateAreas.map((row) => `"${row}"`).join(" "),
    gridTemplateRows: preset.templateRows,
    gridTemplateColumns: preset.templateColumns,
    gap: gap ?? "12px",
    position: "relative",
    zIndex: 1,
  };

  return (
    <div style={gridStyle}>
      {preset.areas
        .filter((area) => isGridArea(area.kind))
        .map((area) => {
          const region = regions?.[area.name];
          if (!region) return null;
          return (
            <RegionSlot
              key={area.name}
              area={area}
              region={region}
              channel={channel}
            />
          );
        })}
    </div>
  );
}

function RegionSlot({
  area,
  region,
  channel,
}: {
  area: GridPresetArea;
  region: ChannelRegion;
  channel: Channel;
}) {
  const resolved = resolveRegionComponent(region.component);
  const containerStyle: React.CSSProperties = {
    gridArea: area.name,
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
  };
  if (!resolved) {
    return (
      <div style={containerStyle} className="grid place-items-center rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-200">
        Unknown component: {region.component}
      </div>
    );
  }
  return (
    <div style={containerStyle}>
      <Suspense fallback={<RegionFallback />}>
        {createElement(resolved, { region, channel })}
      </Suspense>
    </div>
  );
}

function LayerBg({ region, channel }: { region: ChannelRegion; channel: Channel }) {
  const resolved = resolveRegionComponent(region.component);
  if (!resolved) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-0">
      <Suspense fallback={null}>{createElement(resolved, { region, channel })}</Suspense>
    </div>
  );
}

function LayerFg({ region, channel }: { region: ChannelRegion; channel: Channel }) {
  const resolved = resolveRegionComponent(region.component);
  if (!resolved) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-50">
      <Suspense fallback={null}>{createElement(resolved, { region, channel })}</Suspense>
    </div>
  );
}

function RegionFallback() {
  return (
    <div className="grid h-full place-items-center rounded-2xl border border-white/5 bg-black/15 text-xs text-white/30">
      loading…
    </div>
  );
}

function isGridArea(kind: RegionKind): boolean {
  return kind !== "layer-bg" && kind !== "layer-fg";
}
