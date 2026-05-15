"use client";

import { useEffect, useRef } from "react";
import type * as Leaflet from "leaflet";
import type { RegionComponentProps } from "../component-registry";

type Marker = {
  lat: number;
  lng: number;
  label?: string;
  detail?: string;
  tone?: "green" | "amber" | "blue";
};

type TileStyle = "dark" | "light" | "satellite";

const TILE_URLS: Record<TileStyle, string> = {
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  light: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  satellite:
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
};

const TONE_COLORS: Record<string, string> = {
  green: "#28f28f",
  amber: "#ffb84d",
  blue: "#7ddcff",
};

export default function MapLeaflet({ region }: RegionComponentProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);

  const center = readCoord(region.props.center, [0, 0]);
  const zoom = readNumber(region.props.zoom, 5);
  const tileStyle = readTileStyle(region.props.tileStyle);
  const interactive = readBoolean(region.props.interactive, false);
  const markers = readMarkers(region.props.markers);
  const route = readRoute(region.props.route);
  const overlayLabel = readString(region.props.overlayLabel);

  // Cheap deterministic fingerprint so a marker/route change re-inits the map
  // without putting object identity into the deps array.
  const markersKey = JSON.stringify(markers);
  const routeKey = JSON.stringify(route);
  const centerKey = `${center[0]},${center[1]}`;

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const L = await import("leaflet");
      if (cancelled || !ref.current || mapRef.current) return;

      const map = L.map(ref.current, {
        zoomControl: interactive,
        attributionControl: false,
        dragging: interactive,
        scrollWheelZoom: interactive,
        doubleClickZoom: interactive,
        boxZoom: interactive,
        keyboard: interactive,
        touchZoom: interactive,
      }).setView(center as Leaflet.LatLngExpression, zoom);
      mapRef.current = map;

      L.tileLayer(TILE_URLS[tileStyle], { maxZoom: 19 }).addTo(map);

      if (route.length >= 2) {
        L.polyline(route as Leaflet.LatLngExpression[], {
          color: "#28f28f",
          weight: 3,
          opacity: 0.78,
          dashArray: "9 10",
        })
          .addTo(map)
          .bringToFront();
      }

      for (const marker of markers) {
        const color = TONE_COLORS[marker.tone ?? "green"] ?? TONE_COLORS.green!;
        L.circleMarker([marker.lat, marker.lng], {
          radius: 7,
          color,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.28,
          opacity: 0.95,
        }).addTo(map);
        if (marker.label) {
          L.marker([marker.lat, marker.lng], {
            interactive: false,
            icon: L.divIcon({
              className: "hormuz-label",
              html: `<span>${escape(marker.label)}</span>${marker.detail ? `<small>${escape(marker.detail)}</small>` : ""}`,
              iconSize: [170, 42],
              iconAnchor: [0, 46],
            }),
          }).addTo(map);
        }
      }

      window.setTimeout(() => map.invalidateSize(), 120);
    }

    void boot();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Re-initialize when any visual prop changes (cheap; map containers are light).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerKey, zoom, tileStyle, interactive, markersKey, routeKey]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div ref={ref} className="absolute inset-0 opacity-75 saturate-[1.25]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_40%_45%,transparent_0,rgba(0,0,0,0.20)_38%,rgba(0,0,0,0.76)_100%),linear-gradient(90deg,rgba(0,0,0,0.12),rgba(0,0,0,0.66))]" />
      {overlayLabel ? (
        <div className="absolute left-8 top-24 max-w-sm rounded-3xl border border-accent-green/25 bg-black/40 p-4 shadow-2xl shadow-black/40 backdrop-blur-md">
          <div className="text-[10px] uppercase tracking-[0.2em] text-accent-green">Map layer</div>
          <div className="mt-1 font-heading text-2xl font-extrabold text-white">{overlayLabel}</div>
        </div>
      ) : null}
    </div>
  );
}

function escape(value: string): string {
  return value.replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;",
  );
}

function readCoord(value: unknown, fallback: [number, number]): [number, number] {
  if (Array.isArray(value) && value.length >= 2) {
    const a = Number(value[0]);
    const b = Number(value[1]);
    if (Number.isFinite(a) && Number.isFinite(b)) return [a, b];
  }
  return fallback;
}

function readMarkers(value: unknown): Marker[] {
  if (!Array.isArray(value)) return [];
  const out: Marker[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const lat = Number(record.lat);
    const lng = Number(record.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push({
      lat,
      lng,
      label: typeof record.label === "string" ? record.label : undefined,
      detail: typeof record.detail === "string" ? record.detail : undefined,
      tone: record.tone === "amber" || record.tone === "blue" || record.tone === "green" ? record.tone : "green",
    });
  }
  return out;
}

function readRoute(value: unknown): Array<[number, number]> {
  if (!Array.isArray(value)) return [];
  const out: Array<[number, number]> = [];
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const a = Number(entry[0]);
    const b = Number(entry[1]);
    if (Number.isFinite(a) && Number.isFinite(b)) out.push([a, b]);
  }
  return out;
}

function readTileStyle(value: unknown): TileStyle {
  return value === "light" || value === "satellite" ? value : "dark";
}

function readNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
