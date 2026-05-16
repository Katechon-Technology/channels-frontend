"use client";

import { createElement, Suspense } from "react";
import type {
  Channel,
  ChannelNarrationMessage,
  ChannelRegion,
  ChannelScene,
} from "@/lib/types";
import {
  getGridPreset,
  type GridPreset,
  type GridPresetArea,
  type RegionKind,
} from "@/lib/grid-presets";
import { resolveRegionComponent } from "./component-registry";

interface ChannelGridProps {
  channel: Channel;
  narration?: ChannelNarrationMessage | null;
  scene?: ChannelScene | null;
}

export function ChannelGrid({ channel, narration, scene }: ChannelGridProps) {
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
      {bg ? <LayerBg region={bg} channel={channel} narration={narration} scene={scene} /> : null}
      <GridSurface
        preset={preset}
        regions={ui.regions}
        channel={channel}
        narration={narration}
        scene={scene}
        gap={ui.gap}
      />
      {fg ? <LayerFg region={fg} channel={channel} narration={narration} scene={scene} /> : null}
      <SceneOverlay scene={scene} sceneKey={narration?.id ?? null} />
    </div>
  );
}

function SceneOverlay({
  scene,
  sceneKey,
}: {
  scene?: ChannelScene | null;
  sceneKey?: string | null;
}) {
  const lowerTitle = scene?.ui?.lowerThirdTitle ?? scene?.title;
  const lowerBody = scene?.ui?.lowerThirdBody;
  const overlayTitle = scene?.ui?.overlayTitle;
  const overlayBody = scene?.ui?.overlayBody;
  if (!lowerTitle && !lowerBody && !overlayTitle && !overlayBody) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-[60]">
      {overlayTitle || overlayBody ? (
        <div
          key={`overlay-${sceneKey ?? overlayTitle ?? overlayBody}`}
          className="scene-overlay-in absolute right-6 top-6 max-w-md rounded-2xl border border-accent-green/25 bg-black/70 p-4 text-white shadow-2xl backdrop-blur"
        >
          {overlayTitle ? (
            <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-accent-green">
              {overlayTitle}
            </div>
          ) : null}
          {overlayBody ? <p className="text-sm leading-6 text-white/85">{overlayBody}</p> : null}
        </div>
      ) : null}
      {lowerTitle || lowerBody ? (
        <div
          key={`lower-${sceneKey ?? lowerTitle ?? lowerBody}`}
          className="scene-lower-in absolute bottom-6 left-6 right-[min(36vw,600px)] rounded-2xl border border-white/10 bg-black/65 px-5 py-3 text-white shadow-2xl backdrop-blur"
        >
          {lowerTitle ? (
            <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-accent-green">
              {lowerTitle}
            </div>
          ) : null}
          {lowerBody ? <p className="line-clamp-3 text-base leading-6 text-white/90">{lowerBody}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function GridSurface({
  preset,
  regions,
  channel,
  narration,
  scene,
  gap,
}: {
  preset: GridPreset;
  regions: Record<string, ChannelRegion>;
  channel: Channel;
  narration?: ChannelNarrationMessage | null;
  scene?: ChannelScene | null;
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
              narration={narration}
              scene={scene}
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
  narration,
  scene,
}: {
  area: GridPresetArea;
  region: ChannelRegion;
  channel: Channel;
  narration?: ChannelNarrationMessage | null;
  scene?: ChannelScene | null;
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
        {createElement(resolved, { region, channel, narration, scene })}
      </Suspense>
    </div>
  );
}

function LayerBg({
  region,
  channel,
  narration,
  scene,
}: {
  region: ChannelRegion;
  channel: Channel;
  narration?: ChannelNarrationMessage | null;
  scene?: ChannelScene | null;
}) {
  const resolved = resolveRegionComponent(region.component);
  if (!resolved) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-0">
      <Suspense fallback={null}>{createElement(resolved, { region, channel, narration, scene })}</Suspense>
    </div>
  );
}

function LayerFg({
  region,
  channel,
  narration,
  scene,
}: {
  region: ChannelRegion;
  channel: Channel;
  narration?: ChannelNarrationMessage | null;
  scene?: ChannelScene | null;
}) {
  const resolved = resolveRegionComponent(region.component);
  if (!resolved) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-50">
      <Suspense fallback={null}>{createElement(resolved, { region, channel, narration, scene })}</Suspense>
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
