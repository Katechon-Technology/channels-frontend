"use client";

import {
  Activity,
  BarChart3,
  BookOpen,
  Captions,
  CircleDollarSign,
  Newspaper,
  Radio,
  Rows3,
} from "lucide-react";
import type { Channel, ChannelBlock, ChannelSpec } from "@/lib/types";
import {
  extractMarketRows,
  extractNewsRows,
  getDataSource,
  latestNarrationFor,
  readBlockMarkets,
} from "@/lib/channel-data";

type BlockProps = {
  block: ChannelBlock;
  channel: Channel;
};

export function ChannelBlockRenderer({ block, channel }: BlockProps) {
  if (block.type === "news.feed") return <NewsFeedBlock block={block} channel={channel} />;
  if (block.type === "news.brief") return <NewsBriefBlock block={block} channel={channel} />;
  if (block.type === "news.sources") return <SourcesBlock block={block} channel={channel} />;
  if (block.type === "markets.ticker") return <MarketTickerBlock block={block} channel={channel} />;
  if (block.type === "markets.chart") return <ChartBlock block={block} channel={channel} />;
  if (block.type === "markets.orderbook") return <OrderbookBlock block={block} channel={channel} />;
  if (block.type === "markets.trades") return <TradesBlock block={block} channel={channel} />;
  if (block.type === "markets.funding") return <FundingBlock block={block} channel={channel} />;
  return <CaptionBlock block={block} channel={channel} />;
}

function Panel({
  block,
  icon,
  children,
}: {
  block: ChannelBlock;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="min-h-[150px] rounded-3xl border border-white/10 bg-surface-1/75 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.28)] backdrop-blur">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/45">
          <span className="text-accent-green">{icon}</span>
          <span className="truncate">{block.title || block.type}</span>
        </div>
        <span className="rounded-full border border-accent-green/25 bg-accent-green/10 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-accent-green">
          {block.sourceRef || "ui"}
        </span>
      </div>
      {children}
    </section>
  );
}

function NewsBriefBlock({ block, channel }: BlockProps) {
  const spec: ChannelSpec = channel.spec;
  const focus = spec.dataSources.flatMap((source) =>
    Object.entries(source.constraints).map(
      ([key, value]) => `${key}: ${stringify(value)}`,
    ),
  );
  return (
    <Panel block={block} icon={<BookOpen size={15} />}>
      <div className="grid gap-3 text-sm text-white/70">
        <p className="font-heading text-2xl font-semibold text-white">{spec.title}</p>
        <p>
          The channel is constrained by the active source envelope. Incoming agent
          changes can tighten region, topic, event, and block selection.
        </p>
        <div className="flex flex-wrap gap-2">
          {focus.slice(0, 8).map((item) => (
            <span
              key={item}
              className="rounded border border-white/10 bg-black/25 px-2 py-1 text-xs text-white/55"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function NewsFeedBlock({ block, channel }: BlockProps) {
  const source = getDataSource(channel, block.sourceRef);
  const rows = extractNewsRows(source, 4);
  return (
    <Panel block={block} icon={<Newspaper size={15} />}>
      {rows.length === 0 ? (
        <EmptyState
          message={
            source?.error
              ? `source "${block.sourceRef}" error: ${source.error}`
              : `waiting for ${block.sourceRef ?? "source"}…`
          }
        />
      ) : (
        <div className="grid gap-2">
          {rows.map((row, index) => (
            <article key={row.id} className="rounded border border-white/10 bg-black/25 p-3">
              <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-accent-blue">
                {row.source || `item ${index + 1}`}
              </div>
              <h3 className="text-sm font-semibold text-white">{row.title}</h3>
              {row.summary ? (
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/50">
                  {row.summary}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}

function SourcesBlock({ block, channel }: BlockProps) {
  return (
    <Panel block={block} icon={<Rows3 size={15} />}>
      <div className="grid gap-2">
        {channel.spec.dataSources.map((source) => {
          const live = channel.dataSourcesData.find((d) => d.sourceId === source.id);
          const status = live?.error
            ? "error"
            : live?.lastRunAt
              ? "live"
              : "idle";
          return (
            <div
              key={source.id}
              className="flex items-center justify-between rounded border border-white/10 bg-black/25 px-3 py-2"
            >
              <span className="text-sm text-white/75">{source.id}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/40">{source.type}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${
                    status === "live"
                      ? "bg-accent-green/15 text-accent-green"
                      : status === "error"
                        ? "bg-red-500/15 text-red-300"
                        : "bg-white/5 text-white/40"
                  }`}
                >
                  {status}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function MarketTickerBlock({ block, channel }: BlockProps) {
  const declaredMarkets = readBlockMarkets(block);
  const selectedMarket = stringify(
    channel.spec.dataSources.find((s) => s.id === block.sourceRef)?.constraints.selectedMarket ?? "",
  ).toUpperCase().replace(/-PERP$/i, "");
  const rows = extractMarketRows(channel, declaredMarkets);
  return (
    <Panel block={block} icon={<Radio size={15} />}>
      {rows.length === 0 ? (
        <EmptyState message="no markets curated" />
      ) : (
        <div className="flex gap-2 overflow-x-auto">
          {rows.map((row) => {
            const isSelected = row.symbol.toUpperCase() === selectedMarket;
            return (
              <div
                key={row.symbol}
                className={`shrink-0 rounded border px-3 py-2 text-sm ${
                  isSelected
                    ? "border-accent-green/40 bg-accent-green/15 text-accent-green"
                    : "border-white/10 bg-black/25 text-white/65"
                }`}
              >
                <div className="font-bold">{row.symbol}-PERP</div>
                <div className="text-xs text-white/55">
                  {row.last === null ? "—" : formatPrice(row.last)}
                  {row.changePct !== null ? (
                    <span
                      className={`ml-2 ${row.changePct >= 0 ? "text-accent-green" : "text-red-300"}`}
                    >
                      {row.changePct >= 0 ? "+" : ""}
                      {row.changePct.toFixed(2)}%
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function ChartBlock({ block, channel }: BlockProps) {
  const source = getDataSource(channel, block.sourceRef);
  const indicators = Array.isArray(block.props.indicators)
    ? block.props.indicators.map((item) => stringify(item))
    : [];
  const symbol =
    stringify(
      channel.spec.dataSources.find((s) => s.id === block.sourceRef)?.constraints
        .selectedMarket ?? block.props.market ?? "",
    ).toUpperCase() || (source ? "—" : "—");
  return (
    <Panel block={block} icon={<BarChart3 size={15} />}>
      <div className="relative h-[260px] overflow-hidden rounded border border-white/10 bg-black/30">
        <div className="absolute left-3 top-3 text-xs uppercase tracking-[0.14em] text-white/45">
          {symbol || "—"}
          {block.props.timeframe ? (
            <span className="ml-2 text-white/35">{stringify(block.props.timeframe)}</span>
          ) : null}
        </div>
        <div className="absolute inset-0 grid place-items-center text-center text-xs text-white/35">
          Live chart streamed by the broadcast stage —
          <br />
          this panel mirrors curated symbol + timeframe.
        </div>
        <div className="absolute bottom-3 left-3 flex flex-wrap gap-2">
          {indicators.map((indicator) => (
            <span
              key={indicator}
              className="rounded border border-accent-blue/30 bg-accent-blue/10 px-2 py-1 text-xs text-accent-blue"
            >
              {indicator}
            </span>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function OrderbookBlock({ block, channel }: BlockProps) {
  const source = getDataSource(channel, block.sourceRef);
  const symbol = stringify(
    channel.spec.dataSources.find((s) => s.id === block.sourceRef)?.constraints.selectedMarket ?? "",
  ).toUpperCase();
  const book = readBookFromSource(source, symbol);
  return (
    <Panel block={block} icon={<Activity size={15} />}>
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

function TradesBlock({ block, channel }: BlockProps) {
  const source = getDataSource(channel, block.sourceRef);
  const trades = readTradesFromSource(source);
  return (
    <Panel block={block} icon={<Activity size={15} />}>
      {trades.length === 0 ? (
        <EmptyState message="no trade tape curated" />
      ) : (
        <div className="grid gap-2 text-xs">
          {trades.slice(0, 5).map((trade, i) => (
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

function FundingBlock({ block, channel }: BlockProps) {
  const source = getDataSource(channel, block.sourceRef);
  const stats = readFundingFromSource(source);
  return (
    <Panel block={block} icon={<CircleDollarSign size={15} />}>
      <div className="grid grid-cols-3 gap-3 text-center">
        <Stat label="Funding" value={stats.funding === null ? "—" : `${(stats.funding * 100).toFixed(4)}%`} />
        <Stat label="Open Int." value={stats.openInterest === null ? "—" : compactCurrency(stats.openInterest)} />
        <Stat label="Predicted" value={stats.predicted === null ? "—" : `${(stats.predicted * 100).toFixed(4)}%`} />
      </div>
    </Panel>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-white/10 bg-black/25 p-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">{label}</div>
      <div className="mt-2 font-heading text-xl text-white">{value}</div>
    </div>
  );
}

function CaptionBlock({ block, channel }: BlockProps) {
  const latest = latestNarrationFor(channel.narrationMessages);
  return (
    <Panel block={block} icon={<Captions size={15} />}>
      {latest ? (
        <div className="grid gap-2">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-accent-blue">
            <span>{latest.source}</span>
            <span className="text-white/35">{formatTimeAgo(latest.createdAt)}</span>
          </div>
          <p className="text-sm leading-6 text-white/85">{latest.text}</p>
        </div>
      ) : (
        <p className="text-sm leading-6 text-white/45">
          No narration yet. The narrator agent posts captions here when the broadcast
          advances and an API key is configured.
        </p>
      )}
    </Panel>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="grid h-24 place-items-center rounded border border-white/5 bg-black/15 text-xs text-white/40">
      {message}
    </div>
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
    return (
      <div className="grid h-12 place-items-center text-xs text-white/30">
        {side} —
      </div>
    );
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
): { bids: Array<{ price: number; size: number }>; asks: Array<{ price: number; size: number }>; mid: number | null } | null {
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
  const mid =
    bids.length && asks.length ? (bids[0]!.price + asks[0]!.price) / 2 : null;
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
    const side = (record.side === "buy" || record.side === "sell") ? record.side : null;
    if (price !== null && size !== null && side !== null) out.push({ side, price, size });
  }
  return out;
}

function readFundingFromSource(
  source: ReturnType<typeof getDataSource>,
): { funding: number | null; openInterest: number | null; predicted: number | null } {
  if (!source?.data || typeof source.data !== "object") {
    return { funding: null, openInterest: null, predicted: null };
  }
  const payload = source.data as Record<string, unknown>;
  return {
    funding: toNumber(payload.funding ?? payload.fundingRate),
    openInterest: toNumber(payload.openInterest ?? payload.oi),
    predicted: toNumber(payload.predictedFunding ?? payload.fundingPredicted),
  };
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const fractionDigits = abs >= 1000 ? 1 : abs >= 1 ? 2 : 4;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

function compactCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatTimeAgo(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleString();
}
