"use client";

import { extractNewsRows, getDataSource } from "@/lib/channel-data";
import type { RegionComponentProps } from "../component-registry";

const SPEED_SECONDS: Record<string, number> = {
  slow: 90,
  medium: 60,
  fast: 35,
};

export default function TickerHeadlines({ region, channel }: RegionComponentProps) {
  const speed = typeof region.props.speed === "string" ? region.props.speed : "medium";
  const limit = Math.max(4, Math.min(40, Math.round(Number(region.props.limit) || 12)));
  const source = getDataSource(channel, region.sourceRef);
  const rows = extractNewsRows(source, limit);

  if (rows.length === 0) {
    return (
      <div className="grid h-full place-items-center rounded-2xl border border-white/5 bg-black/20 text-xs uppercase tracking-[0.22em] text-white/30">
        ticker · waiting for {region.sourceRef ?? "source"}
      </div>
    );
  }

  const duration = SPEED_SECONDS[speed] ?? SPEED_SECONDS.medium!;
  // Duplicate the list so the marquee can loop seamlessly (translate -50%).
  const items = [...rows, ...rows];

  return (
    <div className="flex h-full items-center overflow-hidden rounded-2xl border border-white/10 bg-surface-1/80 backdrop-blur">
      <span className="flex shrink-0 items-center gap-2 border-r border-white/10 px-5 py-2 text-[10px] uppercase tracking-[0.22em] text-accent-green">
        <span className="h-2 w-2 animate-pulse rounded-full bg-accent-green" />
        WIRE
      </span>
      <div
        className="flex w-max items-center gap-10 px-6 py-2 text-sm text-white/85"
        style={{
          animation: `katechon-marquee ${duration}s linear infinite`,
        }}
      >
        {items.map((row, i) => (
          <span key={`${row.id}-${i}`} className="whitespace-nowrap">
            <span className="text-accent-blue/90 mr-2">{row.source}</span>
            {row.title}
          </span>
        ))}
      </div>
    </div>
  );
}
