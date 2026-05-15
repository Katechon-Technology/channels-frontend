"use client";

import type { RegionComponentProps } from "../component-registry";

export default function BackgroundGradient({ region }: RegionComponentProps) {
  const from = typeof region.props.from === "string" ? region.props.from : "#07080a";
  const to = typeof region.props.to === "string" ? region.props.to : "#192127";
  const kind = region.props.kind === "radial" ? "radial" : "linear";
  const angle = Number.isFinite(Number(region.props.angle)) ? Number(region.props.angle) : 180;

  const background =
    kind === "radial"
      ? `radial-gradient(circle at center, ${from} 0%, ${to} 100%)`
      : `linear-gradient(${angle}deg, ${from} 0%, ${to} 100%)`;

  return <div className="absolute inset-0" style={{ background }} />;
}
