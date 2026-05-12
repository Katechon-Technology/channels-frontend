import type {
  Channel,
  ChannelDataSourceData,
  ChannelNarrationMessage,
} from "./types";

export function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function getDataSource(
  channel: Channel,
  sourceRef: string | null | undefined,
): ChannelDataSourceData | null {
  if (!sourceRef) return null;
  return (
    channel.dataSourcesData.find(
      (source) => source.sourceId === sourceRef && !source.error,
    ) ??
    channel.dataSourcesData.find((source) => source.sourceId === sourceRef) ??
    null
  );
}

export function getPayloadItems(payload: unknown): unknown[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const items = (payload as { items?: unknown }).items;
  return Array.isArray(items) ? items : [];
}

export interface NewsRow {
  id: string;
  title: string;
  summary: string;
  source: string;
  link: string;
  published: string | null;
}

export function extractNewsRows(
  source: ChannelDataSourceData | null,
  limit = 6,
): NewsRow[] {
  const items = getPayloadItems(source?.data);
  return items
    .map((value, index) => normalizeNewsRow(value, index, source))
    .filter((row): row is NewsRow => Boolean(row))
    .sort((a, b) => {
      const ta = a.published ? Date.parse(a.published) : 0;
      const tb = b.published ? Date.parse(b.published) : 0;
      return tb - ta;
    })
    .slice(0, limit);
}

function normalizeNewsRow(
  value: unknown,
  index: number,
  source: ChannelDataSourceData | null,
): NewsRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const title =
    readString(item.title) || readString(item.question) || readString(item.name);
  if (!title) return null;
  return {
    id:
      readString(item.id) ||
      readString(item.link) ||
      `${source?.sourceId ?? "slot"}-${index}`,
    title,
    summary:
      readString(item.summary) ||
      readString(item.description) ||
      readString(item.text),
    source:
      readString(item.feed) ||
      readString(item.source) ||
      source?.sourceId ||
      "source",
    link: readString(item.link) || readString(item.url),
    published:
      readString(item.published) || readString(item.publishedAt) || null,
  };
}

export interface MarketRow {
  symbol: string;
  last: number | null;
  changePct: number | null;
}

export function extractMarketRows(
  channel: Channel,
  preferredSymbols?: readonly string[],
): MarketRow[] {
  const hlSources = channel.dataSourcesData.filter(
    (s) =>
      (s.pluginType === "hyperliquid-market-source" ||
        s.sourceType === "hyperliquid-market-source") &&
      !s.error,
  );
  const symbols = preferredSymbols?.length
    ? preferredSymbols
    : uniqueSymbolsFromSources(hlSources);
  return symbols.map((symbol) => readMarketRow(symbol, hlSources));
}

function uniqueSymbolsFromSources(sources: ChannelDataSourceData[]): string[] {
  const seen = new Set<string>();
  for (const source of sources) {
    const payload = source.data;
    if (!payload || typeof payload !== "object") continue;
    const markets = (payload as { markets?: unknown }).markets;
    if (!Array.isArray(markets)) continue;
    for (const market of markets) {
      if (!market || typeof market !== "object") continue;
      const symbol = readString((market as Record<string, unknown>).symbol);
      if (symbol) seen.add(symbol.toUpperCase());
    }
  }
  return [...seen];
}

function readMarketRow(
  symbol: string,
  sources: ChannelDataSourceData[],
): MarketRow {
  for (const source of sources) {
    const payload = source.data;
    if (!payload || typeof payload !== "object") continue;
    const markets = (payload as { markets?: unknown }).markets;
    if (!Array.isArray(markets)) continue;
    for (const market of markets) {
      if (!market || typeof market !== "object") continue;
      const record = market as Record<string, unknown>;
      const candidate = readString(record.symbol);
      if (candidate.toUpperCase() !== symbol.toUpperCase()) continue;
      return {
        symbol,
        last: toNumberOrNull(record.lastPrice ?? record.last ?? record.mid),
        changePct: toNumberOrNull(record.changePct ?? record.change24h ?? null),
      };
    }
  }
  return { symbol, last: null, changePct: null };
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function latestNarrationFor(
  messages: ChannelNarrationMessage[] | null | undefined,
): ChannelNarrationMessage | null {
  if (!messages?.length) return null;
  return [...messages].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  )[0]!;
}

export function readBlockMarkets(block: { props: Record<string, unknown> }): string[] {
  const direct = block.props.markets;
  if (Array.isArray(direct)) {
    return direct.filter((s): s is string => typeof s === "string");
  }
  const single = block.props.market ?? block.props.symbol;
  if (typeof single === "string") return [single];
  return [];
}
