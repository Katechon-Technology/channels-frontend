"use client";

import { Activity } from "lucide-react";
import { getDataSource } from "@/lib/channel-data";
import type { RegionComponentProps } from "../component-registry";
import { EmptyState, Panel, formatPrice } from "./_panel";

export default function MarketsOrderbook({ region, channel }: RegionComponentProps) {
  const source = getDataSource(channel, region.sourceRef);
  const symbol = String(
    channel.spec.dataSources.find((s) => s.id === region.sourceRef)?.constraints.selectedMarket ?? "",
  ).toUpperCase();
  const book = readBookFromSource(source, symbol);
  const title = typeof region.props.title === "string" ? region.props.title : undefined;
  return (
    <Panel title={title} icon={title ? <Activity size={15} /> : undefined}>
      {book ? (
        <>
          <DepthRows side="ask" levels={book.asks.slice(0, 3).reverse()} />
          <div className="my-2 text-center font-heading text-xl text-accent-green">
            {symbol || "—"} {book.mid !== null ? formatPrice(book.mid) : "—"}
          </div>
          <DepthRows side="bid" levels={book.bids.slice(0, 3)} />
        </>
      ) : (
        <EmptyState message="no orderbook curated" />
      )}
    </Panel>
  );
}

function DepthRows({
  side,
  levels,
}: {
  side: "bid" | "ask";
  levels: Array<{ price: number; size: number }>;
}) {
  if (levels.length === 0) {
    return <div className="grid h-12 place-items-center text-xs text-white/30">{side} —</div>;
  }
  return (
    <div className="grid gap-1">
      {levels.map((level, i) => (
        <div
          key={`${side}-${i}-${level.price}`}
          className="grid grid-cols-3 rounded bg-black/25 px-3 py-1 text-xs text-white/65"
        >
          <span className={side === "bid" ? "text-accent-green" : "text-red-300"}>{side}</span>
          <span>{formatPrice(level.price)}</span>
          <span className="text-right">{level.size.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

function readBookFromSource(
  source: ReturnType<typeof getDataSource>,
  symbol: string,
): {
  bids: Array<{ price: number; size: number }>;
  asks: Array<{ price: number; size: number }>;
  mid: number | null;
} | null {
  if (!source?.data || typeof source.data !== "object") return null;
  const payload = source.data as Record<string, unknown>;
  const bookSource = symbol
    ? (payload.orderbooks as Record<string, unknown> | undefined)?.[symbol] ?? payload.orderbook
    : payload.orderbook;
  if (!bookSource || typeof bookSource !== "object") return null;
  const record = bookSource as Record<string, unknown>;
  const bids = parseLevels(record.bids);
  const asks = parseLevels(record.asks);
  if (bids.length === 0 && asks.length === 0) return null;
  const mid = bids.length && asks.length ? (bids[0]!.price + asks[0]!.price) / 2 : null;
  return { bids, asks, mid };
}

function parseLevels(value: unknown): Array<{ price: number; size: number }> {
  if (!Array.isArray(value)) return [];
  const out: Array<{ price: number; size: number }> = [];
  for (const entry of value) {
    if (!entry) continue;
    if (Array.isArray(entry) && entry.length >= 2) {
      const price = toNumber(entry[0]);
      const size = toNumber(entry[1]);
      if (price !== null && size !== null) out.push({ price, size });
      continue;
    }
    if (typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      const price = toNumber(record.price ?? record.px);
      const size = toNumber(record.size ?? record.sz);
      if (price !== null && size !== null) out.push({ price, size });
    }
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
