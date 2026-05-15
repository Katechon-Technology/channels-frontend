"use client";

import { lazy, type LazyExoticComponent, type ComponentType } from "react";
import type { Channel, ChannelRegion } from "@/lib/types";

export interface RegionComponentProps {
  region: ChannelRegion;
  channel: Channel;
}

// Lazy-load every region component so the initial bundle isn't bloated by
// libraries that only some channels touch (lightweight-charts, leaflet, ...).
const NewsFeed = lazy(() => import("./regions/news-feed"));
const NewsBrief = lazy(() => import("./regions/news-brief"));
const NewsSources = lazy(() => import("./regions/news-sources"));
const MarketsTicker = lazy(() => import("./regions/markets-ticker"));
const MarketsOrderbook = lazy(() => import("./regions/markets-orderbook"));
const MarketsTrades = lazy(() => import("./regions/markets-trades"));
const MarketsFunding = lazy(() => import("./regions/markets-funding"));
const NarrationCaptions = lazy(() => import("./regions/narration-captions"));
const BroadcastHyperliquid = lazy(() => import("./regions/broadcast-hyperliquid"));
const BroadcastPolymarket = lazy(() => import("./regions/broadcast-polymarket"));
const MapLeaflet = lazy(() => import("./regions/map-leaflet"));
const HeaderStation = lazy(() => import("./regions/header-station"));
const TickerHeadlines = lazy(() => import("./regions/ticker-headlines"));
const TickerPrices = lazy(() => import("./regions/ticker-prices"));
const PopupHost = lazy(() => import("./regions/popup-host"));
const BackgroundGradient = lazy(() => import("./regions/background-gradient"));
const BackgroundImage = lazy(() => import("./regions/background-image"));

const COMPONENT_REGISTRY: Record<
  string,
  LazyExoticComponent<ComponentType<RegionComponentProps>>
> = {
  "news.feed": NewsFeed,
  "news.brief": NewsBrief,
  "news.sources": NewsSources,
  "markets.ticker": MarketsTicker,
  "markets.orderbook": MarketsOrderbook,
  "markets.trades": MarketsTrades,
  "markets.funding": MarketsFunding,
  "narration.captions": NarrationCaptions,
  "broadcast.hyperliquid": BroadcastHyperliquid,
  "broadcast.polymarket": BroadcastPolymarket,
  "map.leaflet": MapLeaflet,
  "header.station": HeaderStation,
  "ticker.headlines": TickerHeadlines,
  "ticker.prices": TickerPrices,
  "popup.host": PopupHost,
  "background.gradient": BackgroundGradient,
  "background.image": BackgroundImage,
};

export function resolveRegionComponent(
  type: string,
): LazyExoticComponent<ComponentType<RegionComponentProps>> | null {
  return COMPONENT_REGISTRY[type] ?? null;
}

export function isRegionComponentKnown(type: string): boolean {
  return type in COMPONENT_REGISTRY;
}
