"use client";

import type { RegionComponentProps } from "../component-registry";

export default function BackgroundImage({ region }: RegionComponentProps) {
  const url = typeof region.props.url === "string" ? region.props.url : "";
  const dimPercent = Math.max(0, Math.min(100, Math.round(Number(region.props.dimPercent) || 40)));
  if (!url) return null;
  return (
    <div className="absolute inset-0">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url("${escapeCssUrl(url)}")` }}
      />
      <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${dimPercent / 100})` }} />
    </div>
  );
}

function escapeCssUrl(url: string): string {
  return url.replace(/"/g, '\\"');
}
