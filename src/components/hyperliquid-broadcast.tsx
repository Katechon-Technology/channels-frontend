"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  createChart,
  LineSeries,
  type IChartApi,
  type LineData,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Channel, ChannelNarrationMessage } from "@/lib/types";

type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
type OrderbookLevel = { price: number; size: number };
type Orderbook = { bids: OrderbookLevel[]; asks: OrderbookLevel[] };
type DataStatus = "connecting" | "live" | "error";
type HyperliquidMarketSummary = {
  symbol: string;
  last: number | null;
  changePct: number | null;
  funding: number | null;
  openInterest: number | null;
  dayVolume: number | null;
  oraclePrice: number | null;
  summary: string;
};

const INFO_URL = "https://api.hyperliquid.xyz/info";
const WS_URL = "wss://api.hyperliquid.xyz/ws";
const emptyBook: Orderbook = { bids: [], asks: [] };

const intervalMs: Record<Timeframe, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

export function HyperliquidBroadcast({
  channel,
  narration,
  narrationDriven = false,
}: {
  channel: Channel;
  narration?: ChannelNarrationMessage | null;
  narrationDriven?: boolean;
}) {
  const { market: configuredMarket, timeframe, limit } = readMarketConfig(channel);
  const { data: topMarkets } = useTopMarkets(limit);
  const chosenMarketId = narration?.scene?.chosenItemId ?? narration?.metadata?.chosenItemId;
  const selectedMarket = chosenMarketId
    ? topMarkets.find((item) => marketMatchesNarrationId(item.symbol, chosenMarketId)) ?? null
    : null;
  const shouldUseNarrationMarket = narrationDriven || Boolean(narration);
  const market = shouldUseNarrationMarket && selectedMarket ? selectedMarket.symbol : configuredMarket;
  const { data: candles } = useCandles(market, timeframe, 220);
  const { data: book } = useOrderbook(market, 14);
  const { data: funding } = useFunding(market);

  const last = candles.at(-1);
  const prev = candles.at(-2);
  const change = last && prev ? last.close - prev.close : undefined;
  const changePct = last && prev && prev.close !== 0 ? (change! / prev.close) * 100 : undefined;
  const positive = (change ?? 0) >= 0;

  useEffect(() => {
    if (topMarkets.length === 0) return;
    window.dispatchEvent(
      new CustomEvent("katechon:hyperliquid-markets", {
        detail: {
          channelId: channel.id,
          markets: topMarkets.map((item) => ({
            symbol: item.symbol,
            last: item.last,
            changePct: item.changePct,
            funding: item.funding,
            openInterest: item.openInterest,
            dayVolume: item.dayVolume,
            oraclePrice: item.oraclePrice,
            summary: item.summary,
            url: `https://app.hyperliquid.xyz/trade/${item.symbol}`,
          })),
        },
      }),
    );
  }, [channel.id, topMarkets]);

  return (
    <div className="relative flex h-full min-h-[calc(100vh-64px)] flex-col p-5 pt-20 sm:p-8 sm:pt-24 lg:p-10 lg:pt-28">
      <div className="pointer-events-none absolute left-6 right-6 top-6 z-10 flex items-start justify-between gap-6 text-[10px] uppercase tracking-[0.2em] text-white/45 sm:left-8 sm:right-8 sm:top-8">
        <span className="text-accent-green">Katechon</span>
        <span className="max-w-[48vw] truncate text-right">{channel.spec.title}</span>
      </div>

      <section className="grid flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-4">
          <article
            key={market}
            className="scene-story-in rounded-[24px] border border-white/10 bg-black/35 px-5 py-4 shadow-2xl shadow-black/25 backdrop-blur"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-accent-blue">Market watch</div>
                <h2 className="truncate font-heading text-3xl font-extrabold leading-none tracking-tight text-white sm:text-4xl">
                  {market}-PERP
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-white/35">Last price</div>
                  <div className="font-heading text-3xl font-extrabold tracking-[-0.05em] text-white sm:text-4xl">
                    {formatPrice(last?.close)}
                  </div>
                </div>
                <div className={`rounded-2xl border px-4 py-3 text-right ${positive ? "border-accent-green/25 bg-accent-green/10 text-accent-green" : "border-red-300/25 bg-red-400/10 text-red-300"}`}>
                  <div className="text-lg font-black">{change === undefined ? "—" : `${positive ? "+" : ""}${formatPrice(change)}`}</div>
                  <div className="mt-0.5 text-xs font-bold">{changePct === undefined ? "—" : `${positive ? "+" : ""}${changePct.toFixed(2)}%`}</div>
                </div>
                <div className="hidden rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-right sm:block">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-white/35">Funding</div>
                  <div className={`mt-0.5 font-heading text-xl font-extrabold ${((funding ?? 0) >= 0) ? "text-accent-green" : "text-red-300"}`}>
                    {funding === null ? "—" : `${(funding * 100).toFixed(4)}%`}
                  </div>
                </div>
              </div>
            </div>
          </article>

          <article className="relative h-[460px] overflow-hidden rounded-[28px] border border-white/10 bg-[#081018]/95 shadow-2xl shadow-black/35">
            {candles.length === 0 && (
              <div className="absolute inset-0 z-10 grid place-items-center text-sm text-white/55">
                Drawing the market…
              </div>
            )}
            <CandleChart channel={channel} candles={candles} height={460} />
          </article>
        </div>

        <aside className="grid content-start gap-4 pb-[34vh] lg:pb-[38vh]">
          <OrderbookCard book={book} />
          <TopMarketsCard markets={topMarkets} activeSymbol={market} />
        </aside>
      </section>
    </div>
  );
}

function CandleChart({ channel, candles, height }: { channel: Channel; candles: Candle[]; height: number }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      height,
      layout: { background: { color: "#081018" }, textColor: "#d7e3f4" },
      grid: { vertLines: { color: "#142235" }, horzLines: { color: "#142235" } },
      rightPriceScale: { borderColor: "#26364d" },
      timeScale: { borderColor: "#26364d" },
      crosshair: { mode: 0 },
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#28f28f",
      downColor: "#fb7185",
      borderVisible: false,
      wickUpColor: "#28f28f",
      wickDownColor: "#fb7185",
    });
    candleSeries.setData(candles.map((c) => ({ ...c, time: c.time as UTCTimestamp })));

    const indicators = readIndicators(channel);
    const closes = candles.map((c) => c.close);
    if (indicators.some((indicator) => indicator.type === "ema" && indicator.period === 20)) {
      addLine(chart, candles, "EMA 20", ema(closes, 20), "#7ddcff");
    }
    if (indicators.some((indicator) => indicator.type === "ema" && indicator.period === 50)) {
      addLine(chart, candles, "EMA 50", ema(closes, 50), "#ffb84d");
    }
    if (indicators.some((indicator) => indicator.type === "vwap")) {
      addLine(chart, candles, "VWAP", vwap(candles), "#f5d36c");
    }

    chart.timeScale().fitContent();
    const resize = () => chart.applyOptions({ width: containerRef.current?.clientWidth ?? 600 });
    resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, channel, height]);

  return <div ref={containerRef} className="h-full w-full" />;
}

function addLine(chart: IChartApi, candles: Candle[], title: string, values: Array<number | undefined>, color: string) {
  const series = chart.addSeries(LineSeries, { color, lineWidth: 2, title });
  const data: LineData[] = values
    .map((value, i) => (value === undefined ? undefined : { time: candles[i].time as UTCTimestamp, value }))
    .filter(Boolean) as LineData[];
  series.setData(data);
}

function OrderbookCard({ book }: { book: Orderbook }) {
  return (
    <article className="rounded-[26px] border border-white/10 bg-black/35 p-4 backdrop-blur">
      <div className="mb-3 text-xs uppercase tracking-[0.18em] text-white/40">Order book</div>
      <div className="grid gap-1 font-body text-xs leading-5">
        {book.asks.slice().reverse().slice(0, 7).map((level) => (
          <div key={`ask-${level.price}`} className="grid grid-cols-2 rounded-lg bg-red-400/5 px-2 py-1 text-red-300">
            <span>{level.price.toFixed(2)}</span><span className="text-right text-white/45">{level.size.toFixed(3)}</span>
          </div>
        ))}
        {book.bids.slice(0, 7).map((level) => (
          <div key={`bid-${level.price}`} className="grid grid-cols-2 rounded-lg bg-accent-green/5 px-2 py-1 text-accent-green">
            <span>{level.price.toFixed(2)}</span><span className="text-right text-white/45">{level.size.toFixed(3)}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function TopMarketsCard({
  markets,
  activeSymbol,
}: {
  markets: HyperliquidMarketSummary[];
  activeSymbol: string;
}) {
  if (markets.length === 0) return null;
  return (
    <article className="rounded-[26px] border border-white/10 bg-black/35 p-4 backdrop-blur">
      <div className="mb-3 text-xs uppercase tracking-[0.18em] text-white/40">Top perps</div>
      <div className="grid gap-2">
        {markets.slice(0, 6).map((market) => {
          const active = market.symbol === activeSymbol;
          const positive = (market.changePct ?? 0) >= 0;
          return (
            <div
              key={market.symbol}
              className={`grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-xl border px-3 py-2 text-xs ${
                active
                  ? "border-accent-green/30 bg-accent-green/10"
                  : "border-white/8 bg-white/[0.03]"
              }`}
            >
              <div className="min-w-0">
                <div className="truncate font-bold text-white">{market.symbol}-PERP</div>
                <div className="mt-0.5 text-white/40">{formatCompactCurrency(market.dayVolume)} 24h</div>
              </div>
              <div className="text-right">
                <div className="font-bold text-white">{formatPrice(market.last ?? undefined)}</div>
                <div className={positive ? "text-accent-green" : "text-red-300"}>
                  {market.changePct === null
                    ? "—"
                    : `${positive ? "+" : ""}${market.changePct.toFixed(2)}%`}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function useTopMarkets(limit: number) {
  const [state, setState] = useState<{ data: HyperliquidMarketSummary[]; status: DataStatus }>({
    data: [],
    status: "connecting",
  });

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetchTopMarkets(limit)
        .then((data) => !cancelled && setState({ data, status: "live" }))
        .catch(() => !cancelled && setState({ data: [], status: "error" }));
    };
    setState((prev) => ({ ...prev, status: "connecting" }));
    load();
    const id = window.setInterval(load, 45_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [limit]);

  return state;
}

async function fetchTopMarkets(limit: number): Promise<HyperliquidMarketSummary[]> {
  const [meta, contexts] = await postInfo<
    [
      { universe: Array<{ name: string }> },
      Array<Record<string, unknown>>,
    ]
  >({ type: "metaAndAssetCtxs" });

  return meta.universe
    .map((asset, index) => normalizeMarketSummary(asset.name, contexts[index] ?? {}))
    .filter((market): market is HyperliquidMarketSummary => Boolean(market))
    .sort((a, b) => (b.dayVolume ?? 0) - (a.dayVolume ?? 0))
    .slice(0, limit);
}

function marketMatchesNarrationId(symbol: string, id: string): boolean {
  return normalizeCoin(symbol) === normalizeCoin(id);
}

function normalizeMarketSummary(
  symbol: string,
  context: Record<string, unknown>,
): HyperliquidMarketSummary | null {
  const normalized = normalizeCoin(symbol);
  if (!normalized) return null;
  const last = numberOrNull(context.markPx ?? context.midPx ?? context.oraclePx);
  const prevDay = numberOrNull(context.prevDayPx);
  const oraclePrice = numberOrNull(context.oraclePx);
  const dayVolume = numberOrNull(context.dayNtlVlm);
  const funding = numberOrNull(context.funding);
  const openInterest = numberOrNull(context.openInterest);
  const changePct =
    last !== null && prevDay !== null && prevDay !== 0
      ? ((last - prevDay) / prevDay) * 100
      : null;

  return {
    symbol: normalized,
    last,
    changePct,
    funding,
    openInterest,
    dayVolume,
    oraclePrice,
    summary: buildMarketSummary({
      symbol: normalized,
      last,
      changePct,
      funding,
      openInterest,
      dayVolume,
      oraclePrice,
      summary: "",
    }),
  };
}

function buildMarketSummary(market: HyperliquidMarketSummary): string {
  const parts: string[] = [];
  if (market.last !== null) parts.push(`${market.symbol}-PERP trades near $${formatPrice(market.last)}.`);
  if (market.changePct !== null) {
    parts.push(`It is ${market.changePct >= 0 ? "up" : "down"} ${Math.abs(market.changePct).toFixed(2)}% over 24 hours.`);
  }
  if (market.funding !== null) parts.push(`Funding is ${(market.funding * 100).toFixed(4)}%.`);
  if (market.openInterest !== null) {
    parts.push(`Open interest is about ${formatCompactCurrency(market.openInterest)}.`);
  }
  if (market.dayVolume !== null) {
    parts.push(`24 hour notional volume is about ${formatCompactCurrency(market.dayVolume)}.`);
  }
  if (market.oraclePrice !== null && market.last !== null && market.oraclePrice !== 0) {
    const premiumPct = ((market.last - market.oraclePrice) / market.oraclePrice) * 100;
    if (Number.isFinite(premiumPct) && Math.abs(premiumPct) >= 0.05) {
      parts.push(`The perp is trading ${premiumPct >= 0 ? "above" : "below"} oracle by ${Math.abs(premiumPct).toFixed(2)}%.`);
    }
  }
  return parts.join(" ");
}

function useCandles(market: string, timeframe: Timeframe, count = 200) {
  const [state, setState] = useState<{ data: Candle[]; status: DataStatus }>({ data: [], status: "connecting" });

  useEffect(() => {
    let cancelled = false;
    setState({ data: [], status: "connecting" });
    fetchCandles(market, timeframe, count)
      .then((data) => !cancelled && setState({ data, status: "live" }))
      .catch(() => !cancelled && setState({ data: [], status: "error" }));

    const unsubscribe = subscribeCandles(
      market,
      timeframe,
      (candle) => {
        if (cancelled) return;
        setState((prev) => {
          const last = prev.data.at(-1);
          const next = last?.time === candle.time ? [...prev.data.slice(0, -1), candle] : [...prev.data, candle].slice(-count);
          return { data: next, status: "live" };
        });
      },
      () => setState((prev) => ({ ...prev, status: "error" })),
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [market, timeframe, count]);

  return state;
}

function useOrderbook(market: string, depth = 20) {
  const [state, setState] = useState<{ data: Orderbook; status: DataStatus }>({ data: emptyBook, status: "connecting" });
  useEffect(() => {
    setState({ data: emptyBook, status: "connecting" });
    const unsubscribe = subscribeOrderbook(market, depth, (data) => setState({ data, status: "live" }), () => setState((prev) => ({ ...prev, status: "error" })));
    return unsubscribe;
  }, [market, depth]);
  return state;
}

function useFunding(market: string) {
  const [state, setState] = useState<{ data: number | null; status: DataStatus }>({ data: null, status: "connecting" });
  useEffect(() => {
    let cancelled = false;
    setState({ data: null, status: "connecting" });
    fetchFunding(market)
      .then((data) => !cancelled && setState({ data, status: "live" }))
      .catch(() => !cancelled && setState({ data: null, status: "error" }));
    return () => { cancelled = true; };
  }, [market]);
  return state;
}

async function postInfo<T>(body: unknown): Promise<T> {
  const response = await fetch(INFO_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Hyperliquid info API failed: ${response.status}`);
  return response.json() as Promise<T>;
}

function fetchCandles(market: string, timeframe: Timeframe, count = 200): Promise<Candle[]> {
  const coin = normalizeCoin(market);
  const endTime = Date.now();
  const startTime = endTime - intervalMs[timeframe] * count;
  return postInfo<Array<{ t: number; o: string; h: string; l: string; c: string; v: string }>>({
    type: "candleSnapshot",
    req: { coin, interval: timeframe, startTime, endTime },
  }).then((candles) => candles.map((candle) => ({
    time: Math.floor(candle.t / 1000),
    open: Number(candle.o),
    high: Number(candle.h),
    low: Number(candle.l),
    close: Number(candle.c),
    volume: Number(candle.v),
  })));
}

async function fetchFunding(market: string): Promise<number> {
  const coin = normalizeCoin(market);
  const [meta, contexts] = await postInfo<[{ universe: Array<{ name: string }> }, Array<{ funding?: string }>]>({ type: "metaAndAssetCtxs" });
  const index = meta.universe.findIndex((asset) => asset.name === coin);
  if (index < 0) throw new Error(`Unknown asset: ${coin}`);
  return Number(contexts[index]?.funding ?? 0);
}

function subscribeCandles(market: string, timeframe: Timeframe, onCandle: (candle: Candle) => void, onError?: () => void) {
  const coin = normalizeCoin(market);
  const ws = new WebSocket(WS_URL);
  ws.addEventListener("open", () => ws.send(JSON.stringify({ method: "subscribe", subscription: { type: "candle", coin, interval: timeframe } })));
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.channel === "candle" && message.data) {
      const c = message.data as { t: number; o: string; h: string; l: string; c: string; v: string };
      onCandle({ time: Math.floor(c.t / 1000), open: Number(c.o), high: Number(c.h), low: Number(c.l), close: Number(c.c), volume: Number(c.v) });
    }
  });
  ws.addEventListener("error", () => onError?.());
  return () => ws.close();
}

function subscribeOrderbook(market: string, depth: number, onBook: (book: Orderbook) => void, onError?: () => void) {
  const coin = normalizeCoin(market);
  const ws = new WebSocket(WS_URL);
  ws.addEventListener("open", () => ws.send(JSON.stringify({ method: "subscribe", subscription: { type: "l2Book", coin } })));
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.channel !== "l2Book" || !message.data?.levels) return;
    const [rawBids, rawAsks] = message.data.levels as [Array<{ px: string; sz: string }>, Array<{ px: string; sz: string }>];
    onBook({
      bids: rawBids.slice(0, depth).map((level) => ({ price: Number(level.px), size: Number(level.sz) })),
      asks: rawAsks.slice(0, depth).map((level) => ({ price: Number(level.px), size: Number(level.sz) })),
    });
  });
  ws.addEventListener("error", () => onError?.());
  return () => ws.close();
}

function readIndicators(channel: Channel): Array<{ type: string; period?: number }> {
  // Pull indicators from any region whose component props declare them. This
  // works for the v2 `broadcast.hyperliquid` region (props can carry indicators)
  // and also for any future `markets.chart` region that decomposes the view.
  for (const region of Object.values(channel.spec.ui.regions ?? {})) {
    const indicators = (region.props as { indicators?: unknown }).indicators;
    if (!Array.isArray(indicators)) continue;
    return indicators.filter((indicator): indicator is { type: string; period?: number } =>
      !!indicator
      && typeof indicator === "object"
      && !Array.isArray(indicator)
      && typeof (indicator as { type?: unknown }).type === "string",
    );
  }
  return [];
}

function readMarketConfig(channel: Channel): { market: string; timeframe: Timeframe; limit: number } {
  const hyperliquid = channel.spec.dataSources.find((item) => item.id === "hyperliquid") ?? channel.spec.dataSources[0];
  const selected = stringify(hyperliquid?.constraints.selectedMarket ?? "BTC").replace(/-PERP$/i, "").toUpperCase();
  const timeframe = normalizeTimeframe(stringify(hyperliquid?.constraints.timeframe ?? "5m"));
  const rawLimit =
    typeof hyperliquid?.constraints.limit === "number"
      ? hyperliquid.constraints.limit
      : channel.spec.playout?.limit ?? 10;
  const limit = Math.min(30, Math.max(3, Math.round(rawLimit)));
  return { market: selected || "BTC", timeframe, limit };
}

function normalizeTimeframe(value: string): Timeframe {
  return ["1m", "5m", "15m", "1h", "4h", "1d"].includes(value) ? value as Timeframe : "5m";
}

function normalizeCoin(market: string) {
  return market.toUpperCase().replace(/-PERP$/, "");
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatPrice(value?: number) {
  if (value === undefined || Number.isNaN(value)) return "—";
  return value >= 1000
    ? value.toLocaleString(undefined, { maximumFractionDigits: 1 })
    : value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function formatCompactCurrency(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
    style: "currency",
    currency: "USD",
  }).format(value);
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value) ?? "";
}

function ema(values: number[], period: number): Array<number | undefined> {
  const k = 2 / (period + 1);
  let prev: number | undefined;
  return values.map((value, i) => {
    if (i + 1 < period) return undefined;
    if (prev === undefined) prev = values.slice(i + 1 - period, i + 1).reduce((a, b) => a + b, 0) / period;
    else prev = value * k + prev * (1 - k);
    return prev;
  });
}

function vwap(candles: Candle[]): Array<number | undefined> {
  let pv = 0;
  let vol = 0;
  return candles.map((c) => {
    const typical = (c.high + c.low + c.close) / 3;
    pv += typical * c.volume;
    vol += c.volume;
    return pv / vol;
  });
}
