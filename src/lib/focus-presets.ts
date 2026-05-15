import type { Channel, ChannelSpec } from "./types";

export type FocusOptionKind =
  | "news-world"
  | "news-europe"
  | "news-iran"
  | "news-hormuz-map"
  | "market-btc"
  | "market-eth"
  | "market-sol"
  | "market-indicators"
  | "market-poly-24h"
  | "market-poly-volume"
  | "market-poly-featured"
  | "market-poly-politics"
  | "market-poly-crypto";

export interface FocusOption {
  label: string;
  hint: string;
  prompt: string;
  kind: FocusOptionKind;
}

/**
 * Hardcoded data-steering presets — these only mutate `dataSources` /
 * `title` / `playout` / (for hormuz/indicators) a single region, so they
 * coexist cleanly with the v2 regions DSL.
 */
export function focusOptionsForChannel(channel: Channel): FocusOption[] {
  if (channel.spec.channelType === "news") {
    if (hasHormuzMap(channel)) return [];
    if (isIranFocus(channel)) {
      return [
        {
          label: "Add map of Hormuz",
          hint: "Drop a live map of the Strait of Hormuz behind the broadcast.",
          kind: "news-hormuz-map",
          prompt:
            "Add a cinematic map layer focused on the Strait of Hormuz, with key ports, islands, and shipping corridor points highlighted behind the Iran news broadcast.",
        },
      ];
    }
    return [
      {
        label: "World",
        hint: "Return to a broad international briefing.",
        kind: "news-world",
        prompt:
          "Make this a broad world news channel again. Set the news region to global and clear keyword filters.",
      },
      {
        label: "Europe",
        hint: "Focus the channel on European news.",
        kind: "news-europe",
        prompt:
          "Focus this news channel on Europe — EU, NATO, France, Germany, UK, and major European capitals.",
      },
      {
        label: "Iran",
        hint: "Follow Iran and the wider region.",
        kind: "news-iran",
        prompt:
          "Focus this news channel on Iran — Tehran, IRGC, sanctions, the Persian Gulf, and Iran's relationships.",
      },
    ];
  }

  if (channel.spec.channelType === "polymarket") {
    return [
      { label: "Top 24h", hint: "Most active markets by 24-hour volume.", kind: "market-poly-24h",
        prompt: "Switch the Polymarket channel to the top-24h volume ordering." },
      { label: "All-Time", hint: "Biggest markets by lifetime volume.", kind: "market-poly-volume",
        prompt: "Switch the Polymarket channel to all-time volume ordering." },
      { label: "Featured", hint: "Polymarket's editorially featured markets.", kind: "market-poly-featured",
        prompt: "Switch the Polymarket channel to featured markets." },
      { label: "Politics", hint: "Politics-tagged markets only.", kind: "market-poly-politics",
        prompt: "Filter the Polymarket channel to politics-tagged markets." },
      { label: "Crypto", hint: "Crypto-tagged markets only.", kind: "market-poly-crypto",
        prompt: "Filter the Polymarket channel to crypto-tagged markets." },
    ];
  }

  if (channel.spec.channelType === "hyperliquid") {
    if (hasMarketSelected(channel) && !hasMarketIndicators(channel)) {
      return [
        {
          label: "Add indicators",
          hint: "Overlay EMA 20, EMA 50, and VWAP on the chart.",
          kind: "market-indicators",
          prompt:
            "Add chart overlays for this selected market: EMA 20, EMA 50, and VWAP. Keep the market and timeframe unchanged.",
        },
      ];
    }
    return [
      { label: "BTC", hint: "Bitcoin on a 5m chart.", kind: "market-btc",
        prompt: "Switch the market channel to BTC on a 5m timeframe." },
      { label: "ETH", hint: "Ethereum on a 15m chart.", kind: "market-eth",
        prompt: "Switch the market channel to ETH on a 15m timeframe." },
      { label: "SOL", hint: "Solana on a 1m chart.", kind: "market-sol",
        prompt: "Switch the market channel to SOL on a 1m timeframe." },
    ];
  }

  return [];
}

/**
 * Whether this option should be auto-applied without showing the preview modal.
 * The originals (hormuz / indicators) jumped straight to the broadcast so the
 * viewer wasn't pulled out of "watching" mode for a one-click add.
 */
export function isAutoApplyOption(kind: FocusOptionKind): boolean {
  return kind === "news-hormuz-map" || kind === "market-indicators";
}

export function buildFocusPatch(
  channel: Channel,
  option: FocusOption,
): Partial<ChannelSpec> {
  if (option.kind === "market-indicators") {
    // Indicators are read by HyperliquidBroadcast from the first region whose
    // props declare them; in v2 templates the broadcast lives in `main`.
    return {
      ui: {
        ...channel.spec.ui,
        regions: {
          ...channel.spec.ui.regions,
          main: {
            ...(channel.spec.ui.regions.main ?? { component: "broadcast.hyperliquid", props: {} }),
            props: {
              ...(channel.spec.ui.regions.main?.props ?? {}),
              indicators: [
                { type: "ema", period: 20 },
                { type: "ema", period: 50 },
                { type: "vwap" },
              ],
            },
          },
        },
      },
    };
  }

  if (option.kind === "news-hormuz-map") {
    // Stamp the Strait-of-Hormuz map into the broadcast preset's `bg` layer.
    return {
      title: "Iran Watch · Strait of Hormuz",
      dataSources: channel.spec.dataSources.map((source) => {
        if (source.id === "wire" || source.id === "filtered_wire") {
          return {
            ...source,
            constraints: { ...source.constraints, event: "strait-of-hormuz-map" },
          };
        }
        return source;
      }),
      ui: {
        ...channel.spec.ui,
        regions: {
          ...channel.spec.ui.regions,
          bg: {
            component: "map.leaflet",
            props: {
              center: [26.35, 56.35],
              zoom: 7,
              tileStyle: "dark",
              interactive: false,
              overlayLabel: "Strait of Hormuz",
              markers: [
                { lat: 26.56, lng: 56.25, label: "Strait of Hormuz", detail: "shipping chokepoint", tone: "green" },
                { lat: 27.18, lng: 56.27, label: "Bandar Abbas", detail: "Iranian port", tone: "amber" },
                { lat: 26.82, lng: 55.9, label: "Qeshm Island", detail: "island corridor", tone: "blue" },
                { lat: 26.2, lng: 56.25, label: "Musandam", detail: "Oman peninsula", tone: "green" },
                { lat: 25.13, lng: 56.33, label: "Fujairah", detail: "UAE energy port", tone: "amber" },
              ],
              route: [
                [25.25, 56.45],
                [25.78, 56.42],
                [26.18, 56.36],
                [26.48, 56.24],
                [26.72, 55.98],
                [27.04, 55.62],
              ],
            },
          },
        },
      },
    };
  }

  if (option.kind.startsWith("news-")) {
    const focus = newsFocusConstraints(option.kind);
    return {
      title: focus.title,
      dataSources: channel.spec.dataSources.map((source) => {
        if (source.id === "wire") {
          return {
            ...source,
            constraints: { ...source.constraints, region: focus.region, topic: focus.topic, limit: 100 },
          };
        }
        if (source.id === "filtered_wire") {
          return {
            ...source,
            constraints: {
              ...source.constraints,
              include: focus.include,
              exclude: focus.exclude,
              region: focus.region,
              topic: focus.topic,
            },
          };
        }
        return source;
      }),
    };
  }

  if (option.kind.startsWith("market-poly-")) {
    const mode =
      option.kind === "market-poly-volume"
        ? "top-volume"
        : option.kind === "market-poly-featured"
          ? "featured"
          : option.kind === "market-poly-politics"
            ? "politics"
            : option.kind === "market-poly-crypto"
              ? "crypto"
              : "top-24h";
    return {
      title: `Polymarket · ${polymarketModeLabel(mode)}`,
      dataSources: channel.spec.dataSources.map((source) =>
        source.id === "polymarket"
          ? { ...source, constraints: { ...source.constraints, mode } }
          : source,
      ),
    };
  }

  const market = option.kind === "market-eth" ? "ETH" : option.kind === "market-sol" ? "SOL" : "BTC";
  const timeframe = option.kind === "market-eth" ? "15m" : option.kind === "market-sol" ? "1m" : "5m";
  return {
    title: `${market} Market Watch`,
    dataSources: channel.spec.dataSources.map((source) =>
      source.id === "hyperliquid"
        ? {
            ...source,
            constraints: { ...source.constraints, selectedMarket: market, timeframe },
          }
        : source,
    ),
  };
}

export function buildResetPatch(channel: Channel): Partial<ChannelSpec> {
  if (channel.spec.channelType === "polymarket") {
    return {
      title: "Polymarket · Top 24h Volume",
      dataSources: channel.spec.dataSources.map((source) =>
        source.id === "polymarket"
          ? {
              ...source,
              constraints: { ...source.constraints, mode: "top-24h", limit: 20 },
            }
          : source,
      ),
    };
  }

  if (channel.spec.channelType === "hyperliquid") {
    return {
      title: "Hyperliquid Top Markets",
      dataSources: channel.spec.dataSources.map((source) =>
        source.id === "hyperliquid"
          ? {
              ...source,
              constraints: {
                ...source.constraints,
                mode: "top-markets",
                limit: 10,
                selectedMarket: "BTC",
                timeframe: "5m",
              },
            }
          : source,
      ),
      ui: {
        ...channel.spec.ui,
        regions: {
          ...channel.spec.ui.regions,
          main: {
            ...(channel.spec.ui.regions.main ?? { component: "broadcast.hyperliquid", props: {} }),
            props: {},
          },
        },
      },
    };
  }

  return {
    title: "International News",
    dataSources: channel.spec.dataSources.map((source) => {
      if (source.id === "wire") {
        return {
          ...source,
          constraints: {
            ...source.constraints,
            region: "global",
            topic: null,
            event: null,
            limit: 100,
          },
        };
      }
      if (source.id === "filtered_wire") {
        return {
          ...source,
          constraints: {
            ...source.constraints,
            include: [],
            exclude: [],
            region: "global",
            topic: null,
            event: null,
          },
        };
      }
      return source;
    }),
    ui: {
      ...channel.spec.ui,
      regions: {
        // Drop any agent-added bg/fg/ticker/header layers to reset to the
        // bare broadcast view.
        main: channel.spec.ui.regions.main ?? {
          component: "broadcast.news",
          sourceRef: "filtered_wire",
          props: {},
        },
      },
    },
  };
}

export function hasMarketSelected(channel: Channel): boolean {
  if (channel.spec.channelType !== "hyperliquid") return false;
  const source = channel.spec.dataSources.find((item) => item.id === "hyperliquid");
  return typeof source?.constraints.selectedMarket === "string";
}

export function hasMarketIndicators(channel: Channel): boolean {
  if (channel.spec.channelType !== "hyperliquid") return false;
  for (const region of Object.values(channel.spec.ui.regions)) {
    const indicators = (region.props as { indicators?: unknown }).indicators;
    if (Array.isArray(indicators) && indicators.length > 0) return true;
  }
  return false;
}

export function hasHormuzMap(channel: Channel): boolean {
  if (channel.spec.channelType !== "news") return false;
  if (channel.spec.ui.regions.bg?.component === "map.leaflet") return true;
  return channel.spec.dataSources.some(
    (source) => source.constraints.event === "strait-of-hormuz-map",
  );
}

export function isIranFocus(channel: Channel): boolean {
  if (channel.spec.channelType !== "news") return false;
  if (channel.spec.title.toLowerCase().includes("iran")) return true;
  return channel.spec.dataSources.some((source) => {
    const region = typeof source.constraints.region === "string"
      ? source.constraints.region.toLowerCase()
      : "";
    const includeText = JSON.stringify(source.constraints.include ?? "").toLowerCase();
    return (
      region.includes("iran") ||
      includeText.includes("iran") ||
      includeText.includes("tehran")
    );
  });
}

function newsFocusConstraints(kind: FocusOptionKind) {
  if (kind === "news-europe") {
    return {
      title: "Europe Watch",
      region: "europe",
      topic: null as string | null,
      include: [["Europe", "European", "EU", "NATO", "France", "Germany", "UK", "Britain", "Spain", "Italy", "Poland", "Netherlands", "Brussels"]],
      exclude: [],
    };
  }
  if (kind === "news-iran") {
    return {
      title: "Iran Watch",
      region: "iran",
      topic: null as string | null,
      include: [["Iran", "Tehran", "IRGC", "Iranian", "Persian Gulf"]],
      exclude: [],
    };
  }
  return {
    title: "International News",
    region: "global",
    topic: null as string | null,
    include: [] as string[][],
    exclude: [] as string[][],
  };
}

function polymarketModeLabel(mode: string): string {
  switch (mode) {
    case "top-24h": return "Top 24h Volume";
    case "top-volume": return "All-Time Volume";
    case "featured": return "Featured";
    case "politics": return "Politics";
    case "crypto": return "Crypto";
    default: return mode;
  }
}
