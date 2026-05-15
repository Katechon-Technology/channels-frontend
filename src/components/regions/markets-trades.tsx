"use client";

import { Activity } from "lucide-react";
import { getDataSource } from "@/lib/channel-data";
import type { RegionComponentProps } from "../component-registry";
import { EmptyState, Panel, formatPrice, readNumber } from "./_panel";

export default function MarketsTrades({ region, channel }: RegionComponentProps) {
  const source = getDataSource(channel, region.sourceRef);
  const limit = Math.max(1, Math.min(40, Math.round(readNumber(region.props.limit, 8))));
  const trades = readTradesFromSource(source);
  const title = typeof region.props.title === "string" ? region.props.title : undefined;
  return (
    <Panel title={title} icon={title ? <Activity size={15} /> : undefined}>
      {trades.length === 0 ? (
        <EmptyState message="no trade tape curated" />
      ) : (
        <div className="grid h-full gap-2 overflow-y-auto text-xs">
          {trades.slice(0, limit).map((trade, i) => (
            <div
              key={`${trade.price}-${trade.size}-${i}`}
              className="grid grid-cols-3 rounded bg-black/25 px-3 py-2 text-white/65"
            >
              <span className={trade.side === "buy" ? "text-accent-green" : "text-red-300"}>
                {trade.side}
              </span>
              <span>{trade.size.toFixed(3)}</span>
              <span className="text-right">{formatPrice(trade.price)}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function readTradesFromSource(
  source: ReturnType<typeof getDataSource>,
): Array<{ side: "buy" | "sell"; price: number; size: number }> {
  if (!source?.data || typeof source.data !== "object") return [];
  const trades = (source.data as { trades?: unknown }).trades;
  if (!Array.isArray(trades)) return [];
  const out: Array<{ side: "buy" | "sell"; price: number; size: number }> = [];
  for (const trade of trades) {
    if (!trade || typeof trade !== "object") continue;
    const record = trade as Record<string, unknown>;
    const price = toNumber(record.price ?? record.px);
    const size = toNumber(record.size ?? record.sz);
    const side = record.side === "buy" || record.side === "sell" ? record.side : null;
    if (price !== null && size !== null && side !== null) out.push({ side, price, size });
  }
  return out;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
