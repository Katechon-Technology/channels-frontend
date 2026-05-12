"use client";

import { useEffect, useRef } from "react";
import type * as Leaflet from "leaflet";

type Poi = {
  name: string;
  detail: string;
  lat: number;
  lng: number;
  tone: "green" | "amber" | "blue";
};

const POIS: Poi[] = [
  { name: "Strait of Hormuz", detail: "shipping chokepoint", lat: 26.56, lng: 56.25, tone: "green" },
  { name: "Bandar Abbas", detail: "Iranian port", lat: 27.18, lng: 56.27, tone: "amber" },
  { name: "Qeshm Island", detail: "island corridor", lat: 26.82, lng: 55.9, tone: "blue" },
  { name: "Musandam", detail: "Oman peninsula", lat: 26.2, lng: 56.25, tone: "green" },
  { name: "Fujairah", detail: "UAE energy port", lat: 25.13, lng: 56.33, tone: "amber" },
];

export function HormuzMapBackground() {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const L = await import("leaflet");
      if (cancelled || !ref.current || mapRef.current) return;

      const map = L.map(ref.current, {
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        touchZoom: false,
      }).setView([26.35, 56.35], 7);
      mapRef.current = map;

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
      }).addTo(map);

      const route = L.polyline(
        [
          [25.25, 56.45],
          [25.78, 56.42],
          [26.18, 56.36],
          [26.48, 56.24],
          [26.72, 55.98],
          [27.04, 55.62],
        ],
        {
          color: "#28f28f",
          weight: 3,
          opacity: 0.78,
          dashArray: "9 10",
        },
      ).addTo(map);

      POIS.forEach((poi) => {
        const color = poi.tone === "amber" ? "#ffb84d" : poi.tone === "blue" ? "#7ddcff" : "#28f28f";
        L.circleMarker([poi.lat, poi.lng], {
          radius: 7,
          color,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.28,
          opacity: 0.95,
        }).addTo(map);
        L.marker([poi.lat, poi.lng], {
          interactive: false,
          icon: L.divIcon({
            className: "hormuz-label",
            html: `<span>${poi.name}</span><small>${poi.detail}</small>`,
            iconSize: [170, 42],
            iconAnchor: [0, 46],
          }),
        }).addTo(map);
      });

      route.bringToFront();
      window.setTimeout(() => map.invalidateSize(), 120);
    }

    void boot();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div ref={ref} className="absolute inset-0 opacity-75 saturate-[1.25]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_40%_45%,transparent_0,rgba(0,0,0,0.20)_38%,rgba(0,0,0,0.76)_100%),linear-gradient(90deg,rgba(0,0,0,0.12),rgba(0,0,0,0.66))]" />
      <div className="absolute left-8 top-24 max-w-sm rounded-3xl border border-accent-green/25 bg-black/40 p-4 shadow-2xl shadow-black/40 backdrop-blur-md">
        <div className="text-[10px] uppercase tracking-[0.2em] text-accent-green">Map layer</div>
        <div className="mt-1 font-heading text-2xl font-extrabold text-white">Strait of Hormuz</div>
        <p className="mt-2 text-xs leading-5 text-white/55">
          Highlighting ports, islands, and the maritime corridor at the mouth of the Persian Gulf.
        </p>
      </div>
    </div>
  );
}
