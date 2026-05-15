"use client";

import { extractMarketRows } from "@/lib/channel-data";
import type { RegionComponentProps } from "../component-registry";
import { formatPrice } from "./_panel";

const SPEED_SECONDS: Record<string, number> = {
  slow: 90,
  medium: 60,
  fast: 35,
};

export default function TickerPrices({ region, channel }: RegionComponentProps) {
  const speed = typeof region.props.speed === "string" ? region.props.speed : "medium";
  const limit = Math.max(4, Math.min(30, Math.round(Number(region.props.limit) || 10)));
  const rows = extractMarketRows(channel).slice(0, limit);

  if (rows.length === 0) {
    return (
      <div className="grid h-full place-items-center rounded-2xl border border-white/5 bg-black/20 text-xs uppercase tracking-[0.22em] text-white/30">
        ticker · waiting for markets
      </div>
    );
  }

  const duration = SPEED_SECONDS[speed] ?? SPEED_SECONDS.medium!;
  const items = [...rows, ...rows];

  return (
    <div className="flex h-full items-center overflow-hidden rounded-2xl border border-white/10 bg-surface-1/80 backdrop-blur">
      <span className="flex shrink-0 items-center gap-2 border-r border-white/10 px-5 py-2 text-[10px] uppercase tracking-[0.22em] text-accent-green">
        <span className="h-2 w-2 animate-pulse rounded-full bg-accent-green" />
        MARKETS
      </span>
      <div
        className="flex w-max items-center gap-8 px-6 py-2 text-sm text-white/85 tabular-nums"
        style={{
          animation: `katechon-marquee ${duration}s linear infinite`,
        }}
      >
        {items.map((row, i) => (
          <span key={`${row.symbol}-${i}`} className="whitespace-nowrap">
            <span className="text-white font-bold mr-2">{row.symbol}</span>
            {row.last === null ? "—" : formatPrice(row.last)}
            {row.changePct !== null ? (
              <span
                className={`ml-2 ${row.changePct >= 0 ? "text-accent-green" : "text-red-300"}`}
              >
                {row.changePct >= 0 ? "+" : ""}
                {row.changePct.toFixed(2)}%
              </span>
            ) : null}
          </span>
        ))}
      </div>
    </div>
  );
}
