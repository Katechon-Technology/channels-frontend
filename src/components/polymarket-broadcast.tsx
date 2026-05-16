"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  LineSeries,
  type IChartApi,
  type LineData,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Channel, ChannelNarrationMessage } from "@/lib/types";

export type PolymarketMode =
  | "top-24h"
  | "top-volume"
  | "featured"
  | "politics"
  | "crypto";

export interface PolymarketMarket {
  id: string;
  slug: string;
  question: string;
  image: string | null;
  yesPrice: number | null;
  noPrice: number | null;
  yesTokenId: string | null;
  volume24hr: number | null;
  url?: string | null;
}

interface PriceHistoryPoint {
  t: number;
  p: number;
}

const GAMMA_URL = "https://gamma-api.polymarket.com/markets";
const CLOB_HISTORY_URL = "https://clob.polymarket.com/prices-history";

const MODE_LABELS: Record<PolymarketMode, string> = {
  "top-24h": "Top 24h Volume",
  "top-volume": "Top All-Time Volume",
  featured: "Featured",
  politics: "Politics",
  crypto: "Crypto",
};

export function PolymarketBroadcast({
  channel,
  narration,
  narrationDriven = false,
  onActiveMarketChange,
}: {
  channel: Channel;
  narration?: ChannelNarrationMessage | null;
  narrationDriven?: boolean;
  onActiveMarketChange?: (market: PolymarketMarket | null) => void;
}) {
  const { mode, limit, durationSeconds } = readPolymarketConfig(channel);
  const channelMarkets = useMemo(() => readChannelPolymarketMarkets(channel), [channel]);
  const remote = useMarkets(mode, limit);
  const markets = channelMarkets.length ? channelMarkets : remote.markets;
  const status = channelMarkets.length ? "ready" : remote.status;
  const fingerprint = markets.map((market) => market.id).join("|");
  const [activeIndex, setActiveIndex] = useState(0);
  const chosenMarketId = narration?.scene?.chosenItemId ?? narration?.metadata?.chosenItemId;
  const controlledByNarration = narrationDriven || Boolean(narration);

  useEffect(() => {
    setActiveIndex(0);
  }, [mode, fingerprint]);

  useEffect(() => {
    if (controlledByNarration || markets.length <= 1) return;
    const id = window.setInterval(() => {
      setActiveIndex((i) => (i + 1) % markets.length);
    }, durationSeconds * 1000);
    return () => window.clearInterval(id);
  }, [controlledByNarration, markets.length, durationSeconds]);

  const narrationMarket = chosenMarketId
    ? markets.find((market) => marketMatchesNarrationId(market, chosenMarketId)) ?? null
    : null;
  const active = narrationMarket ?? (markets.length ? markets[activeIndex % markets.length]! : null);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("katechon:polymarket-markets", {
        detail: {
          channelId: channel.id,
          markets: markets.map((market) => ({
            id: market.id,
            slug: market.slug,
            question: market.question,
            yesPrice: market.yesPrice,
            noPrice: market.noPrice,
            volume24hr: market.volume24hr,
            url: market.url ?? null,
          })),
        },
      }),
    );
  }, [channel.id, markets]);

  useEffect(() => {
    onActiveMarketChange?.(active);
  }, [active, onActiveMarketChange]);

  const { history } = usePriceHistory(active?.yesTokenId ?? null);

  return (
    <div className="relative h-full min-h-[calc(100vh-64px)] overflow-hidden">
      <MarketBackdrop market={active} />

      <div className="pointer-events-none absolute left-6 right-6 top-6 z-20 flex items-start justify-between gap-6 text-[10px] uppercase tracking-[0.2em] text-white/55 sm:left-8 sm:right-8 sm:top-8">
        <span className="text-accent-green">Katechon</span>
        <span className="max-w-[48vw] truncate text-right">{channel.spec.title}</span>
      </div>

      {active ? (
        <article
          key={active.id}
          className="scene-story-in pointer-events-none absolute left-6 top-24 z-10 max-w-md rounded-3xl border border-accent-green/25 bg-black/55 p-5 shadow-2xl shadow-black/40 backdrop-blur-md sm:left-8 sm:top-28 sm:max-w-lg"
        >
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-accent-green">
            <span>Polymarket</span>
            <span className="text-white/35">·</span>
            <span className="text-white/55">{MODE_LABELS[mode]}</span>
          </div>
          <h2 className="mt-2 line-clamp-3 font-heading text-2xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-3xl">
            {active.question}
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <PriceChip label="YES" price={active.yesPrice} tone="green" />
            <PriceChip label="NO" price={active.noPrice} tone="red" />
            {active.volume24hr !== null ? (
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] font-bold text-white/65">
                {formatCompactCurrency(active.volume24hr)} 24h vol
              </span>
            ) : null}
          </div>
          <div className="mt-4 h-[130px] overflow-hidden rounded-2xl border border-white/10 bg-black/40">
            <YesNoChart history={history} fallbackYes={active.yesPrice} />
          </div>
        </article>
      ) : (
        <div className="absolute inset-0 z-10 grid place-items-center text-center text-sm text-white/55">
          {status === "error"
            ? "Polymarket feed is offline."
            : status === "empty"
              ? "No open markets returned."
              : "Loading Polymarket markets…"}
        </div>
      )}
    </div>
  );
}

function readChannelPolymarketMarkets(channel: Channel): PolymarketMarket[] {
  const sourceRef = channel.spec.playout?.sourceRef ?? "polymarket";
  const source =
    channel.dataSourcesData.find((item) => item.sourceId === sourceRef && !item.error) ??
    channel.dataSourcesData.find((item) => item.sourceType.includes("polymarket") && !item.error) ??
    null;
  const items = readPayloadItems(source?.data);
  return items
    .map((item) => normalizeChannelMarket(item))
    .filter((item): item is PolymarketMarket => Boolean(item));
}

function readPayloadItems(payload: unknown): unknown[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const items = (payload as { items?: unknown }).items;
  return Array.isArray(items) ? items : [];
}

function normalizeChannelMarket(value: unknown): PolymarketMarket | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const title = readString(record.title) || readString(record.question) || readString(record.name);
  if (!title) return null;

  const outcomes = Array.isArray(record.outcomes) ? record.outcomes.map(String) : [];
  const outcomePrices = Array.isArray(record.outcomePrices)
    ? record.outcomePrices.map((price) => toNumberOrNull(price))
    : [];
  const yesIdx = Math.max(
    0,
    outcomes.findIndex((outcome) => outcome.toLowerCase() === "yes"),
  );
  const yesProb =
    toNumberOrNull(record.yesProb) ??
    toNumberOrNull(record.yesPrice) ??
    outcomePrices[yesIdx] ??
    null;
  const clobTokenIds = Array.isArray(record.clobTokenIds)
    ? record.clobTokenIds.map(String)
    : [];
  const id = readString(record.id) || readString(record.slug) || title;
  const slug = readString(record.marketSlug) || readString(record.slug) || id;

  return {
    id,
    slug,
    question: readString(record.question) || title,
    image: readString(record.image) || readString(record.icon) || null,
    yesPrice: yesProb,
    noPrice: yesProb === null ? null : Math.max(0, Math.min(1, 1 - yesProb)),
    yesTokenId: clobTokenIds[yesIdx] ?? clobTokenIds[0] ?? null,
    volume24hr: toNumberOrNull(record.volume24h) ?? toNumberOrNull(record.volume24hr),
    url: readString(record.url) || null,
  };
}

function marketMatchesNarrationId(market: PolymarketMarket, id: string): boolean {
  return market.id === id || market.slug === id;
}

function MarketBackdrop({ market }: { market: PolymarketMarket | null }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {market?.image ? (
        <img
          key={market.id}
          src={market.image}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-90"
          referrerPolicy="no-referrer"
        />
      ) : null}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_40%,rgba(0,0,0,0.20)_0,rgba(0,0,0,0.55)_55%,rgba(0,0,0,0.88)_100%),linear-gradient(180deg,rgba(0,0,0,0.45),rgba(0,0,0,0.75))]" />
    </div>
  );
}

function PriceChip({
  label,
  price,
  tone,
}: {
  label: string;
  price: number | null;
  tone: "green" | "red";
}) {
  const pct = price === null ? "—" : `${Math.round(price * 100)}%`;
  const classes =
    tone === "green"
      ? "border-accent-green/30 bg-accent-green/10 text-accent-green"
      : "border-red-300/30 bg-red-400/10 text-red-300";
  return (
    <span
      className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${classes}`}
    >
      {label} {pct}
    </span>
  );
}

function YesNoChart({
  history,
  fallbackYes,
}: {
  history: PriceHistoryPoint[];
  fallbackYes: number | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      height: 130,
      layout: { background: { color: "transparent" }, textColor: "#cfd6e3" },
      grid: { vertLines: { visible: false }, horzLines: { color: "#1f2a3a" } },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.05, bottom: 0.05 },
      },
      timeScale: { borderVisible: false, visible: false },
      crosshair: { mode: 0 },
      handleScroll: false,
      handleScale: false,
    });
    chartRef.current = chart;

    const percentFormat = {
      type: "custom" as const,
      formatter: (price: number) =>
        Number.isFinite(price) ? `${Math.round(price * 100)}%` : "—",
      minMove: 0.01,
    };
    const pinTo01 = () => ({
      priceRange: { minValue: 0, maxValue: 1 },
    });

    const series = chart.addSeries(LineSeries, {
      color: "#28f28f",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      priceFormat: percentFormat,
      autoscaleInfoProvider: pinTo01,
    });
    const noSeries = chart.addSeries(LineSeries, {
      color: "#fb7185",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      priceFormat: percentFormat,
      autoscaleInfoProvider: pinTo01,
    });

    const yesData = buildLineData(history, fallbackYes, false);
    const noData = buildLineData(history, fallbackYes, true);
    series.setData(yesData);
    noSeries.setData(noData);

    chart.timeScale().fitContent();
    const resize = () =>
      chart.applyOptions({ width: containerRef.current?.clientWidth ?? 320 });
    resize();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      chart.remove();
      chartRef.current = null;
    };
  }, [history, fallbackYes]);

  return <div ref={containerRef} className="h-full w-full" />;
}

function buildLineData(
  history: PriceHistoryPoint[],
  fallbackYes: number | null,
  invert: boolean,
): LineData[] {
  if (history.length === 0) {
    if (fallbackYes === null) return [];
    const now = Math.floor(Date.now() / 1000);
    const value = invert ? 1 - fallbackYes : fallbackYes;
    return [
      { time: (now - 3600) as UTCTimestamp, value },
      { time: now as UTCTimestamp, value },
    ];
  }
  return history.map((point) => ({
    time: point.t as UTCTimestamp,
    value: invert ? 1 - point.p : point.p,
  }));
}

function useMarkets(mode: PolymarketMode, limit: number) {
  const [state, setState] = useState<{
    markets: PolymarketMarket[];
    status: "loading" | "ready" | "empty" | "error";
  }>({ markets: [], status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ markets: [], status: "loading" });
    fetchMarkets(mode, limit)
      .then((markets) => {
        if (cancelled) return;
        setState({
          markets,
          status: markets.length === 0 ? "empty" : "ready",
        });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ markets: [], status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [mode, limit]);

  return state;
}

function usePriceHistory(yesTokenId: string | null) {
  const [history, setHistory] = useState<PriceHistoryPoint[]>([]);
  const cacheRef = useRef<Map<string, PriceHistoryPoint[]>>(new Map());

  useEffect(() => {
    if (!yesTokenId) {
      setHistory([]);
      return;
    }
    const cached = cacheRef.current.get(yesTokenId);
    if (cached) {
      setHistory(cached);
      return;
    }
    let cancelled = false;
    setHistory([]);
    fetchPriceHistory(yesTokenId)
      .then((data) => {
        if (cancelled) return;
        cacheRef.current.set(yesTokenId, data);
        setHistory(data);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      });
    return () => {
      cancelled = true;
    };
  }, [yesTokenId]);

  return { history };
}

async function fetchMarkets(
  mode: PolymarketMode,
  limit: number,
): Promise<PolymarketMarket[]> {
  const params = new URLSearchParams({
    active: "true",
    closed: "false",
    archived: "false",
    limit: String(Math.max(limit * 2, 30)),
    ascending: "false",
  });
  if (mode === "top-24h") params.set("order", "volume24hr");
  else if (mode === "top-volume") params.set("order", "volumeNum");
  else if (mode === "featured") {
    params.set("featured", "true");
    params.set("order", "volume24hr");
  } else if (mode === "politics") {
    params.set("tag_slug", "politics");
    params.set("order", "volume24hr");
  } else if (mode === "crypto") {
    params.set("tag_slug", "crypto");
    params.set("order", "volume24hr");
  }

  const resp = await fetch(`${GAMMA_URL}?${params.toString()}`);
  if (!resp.ok) throw new Error(`Polymarket markets ${resp.status}`);
  const raw = (await resp.json()) as unknown;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry) => normalizeMarket(entry))
    .filter((m): m is PolymarketMarket => Boolean(m))
    .slice(0, limit);
}

function normalizeMarket(value: unknown): PolymarketMarket | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const question = typeof record.question === "string" ? record.question.trim() : "";
  if (!question) return null;

  const outcomes = parseJsonString(record.outcomes);
  if (!Array.isArray(outcomes) || outcomes.length !== 2) return null;
  const labels = outcomes.map((o) => String(o).toLowerCase());
  if (!labels.includes("yes") || !labels.includes("no")) return null;

  const yesIdx = labels.indexOf("yes");
  const noIdx = labels.indexOf("no");

  const prices = parseJsonString(record.outcomePrices);
  const yesPrice =
    Array.isArray(prices) && prices[yesIdx] !== undefined
      ? toNumberOrNull(prices[yesIdx])
      : null;
  const noPrice =
    Array.isArray(prices) && prices[noIdx] !== undefined
      ? toNumberOrNull(prices[noIdx])
      : yesPrice !== null
        ? 1 - yesPrice
        : null;

  const tokens = parseJsonString(record.clobTokenIds);
  const yesTokenId =
    Array.isArray(tokens) && typeof tokens[yesIdx] === "string"
      ? (tokens[yesIdx] as string)
      : null;

  const image =
    (typeof record.image === "string" && record.image) ||
    (typeof record.icon === "string" && record.icon) ||
    null;

  const id = String(record.id ?? record.slug ?? question);
  const slug = typeof record.slug === "string" ? record.slug : id;

  return {
    id,
    slug,
    question,
    image,
    yesPrice,
    noPrice,
    yesTokenId,
    volume24hr: toNumberOrNull(record.volume24hr),
    url: slug ? `https://polymarket.com/market/${slug}` : null,
  };
}

async function fetchPriceHistory(yesTokenId: string): Promise<PriceHistoryPoint[]> {
  const params = new URLSearchParams({
    market: yesTokenId,
    interval: "1d",
    fidelity: "60",
  });
  const resp = await fetch(`${CLOB_HISTORY_URL}?${params.toString()}`);
  if (!resp.ok) throw new Error(`Polymarket history ${resp.status}`);
  const body = (await resp.json()) as { history?: unknown };
  if (!Array.isArray(body.history)) return [];
  const points: PriceHistoryPoint[] = [];
  for (const entry of body.history) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const t = toNumberOrNull(record.t);
    const p = toNumberOrNull(record.p);
    if (t === null || p === null) continue;
    points.push({ t: Math.floor(t), p });
  }
  return points.sort((a, b) => a.t - b.t);
}

function parseJsonString(value: unknown): unknown {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatCompactCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
    style: "currency",
    currency: "USD",
  }).format(value);
}

export function readPolymarketConfig(channel: Channel): {
  mode: PolymarketMode;
  limit: number;
  durationSeconds: number;
} {
  const source =
    channel.spec.dataSources.find((item) => item.id === "polymarket") ??
    channel.spec.dataSources[0];
  const rawMode =
    typeof source?.constraints.mode === "string"
      ? (source.constraints.mode as string)
      : "top-24h";
  const mode: PolymarketMode = isPolymarketMode(rawMode) ? rawMode : "top-24h";
  const rawLimit =
    typeof source?.constraints.limit === "number"
      ? (source.constraints.limit as number)
      : 20;
  const limit = clamp(rawLimit, 5, 50);
  const rawDuration = channel.spec.playout?.itemDurationSeconds ?? 12;
  const durationSeconds = clamp(rawDuration, 4, 60);
  return { mode, limit, durationSeconds };
}

function isPolymarketMode(value: string): value is PolymarketMode {
  return (
    value === "top-24h" ||
    value === "top-volume" ||
    value === "featured" ||
    value === "politics" ||
    value === "crypto"
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function polymarketModeLabel(mode: PolymarketMode): string {
  return MODE_LABELS[mode];
}
