"use client";

import { Activity, BarChart3, BookOpen, Captions, CircleDollarSign, Newspaper, Radio, Rows3 } from "lucide-react";
import type { ChannelBlock, ChannelSpec } from "@/lib/types";

type BlockProps = {
  block: ChannelBlock;
  spec: ChannelSpec;
};

export function ChannelBlockRenderer({ block, spec }: BlockProps) {
  if (block.type === "news.feed") return <NewsFeedBlock block={block} spec={spec} />;
  if (block.type === "news.brief") return <NewsBriefBlock block={block} spec={spec} />;
  if (block.type === "news.sources") return <SourcesBlock block={block} spec={spec} />;
  if (block.type === "markets.ticker") return <MarketTickerBlock block={block} spec={spec} />;
  if (block.type === "markets.chart") return <ChartBlock block={block} spec={spec} />;
  if (block.type === "markets.orderbook") return <OrderbookBlock block={block} />;
  if (block.type === "markets.trades") return <TradesBlock block={block} />;
  if (block.type === "markets.funding") return <FundingBlock block={block} />;
  return <CaptionBlock block={block} />;
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
    <section className="min-h-[150px] rounded-lg border border-surface-3 bg-surface-1/90 p-4 shadow-[0_0_24px_rgba(0,0,0,0.26)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/45">
          <span className="text-accent-green">{icon}</span>
          <span className="truncate">{block.title || block.type}</span>
        </div>
        <span className="rounded border border-accent-green/25 bg-accent-green/10 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-accent-green">
          {block.sourceRef || "ui"}
        </span>
      </div>
      {children}
    </section>
  );
}

function NewsBriefBlock({ block, spec }: BlockProps) {
  const focus = spec.dataSources.flatMap((source) =>
    Object.entries(source.constraints).map(([key, value]) => `${key}: ${stringify(value)}`),
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
            <span key={item} className="rounded border border-white/10 bg-black/25 px-2 py-1 text-xs text-white/55">
              {item}
            </span>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function NewsFeedBlock({ block }: BlockProps) {
  return (
    <Panel block={block} icon={<Newspaper size={15} />}>
      <div className="grid gap-2">
        {["Source item", "Corroborating source", "Market-adjacent context", "Follow-up signal"].map((label, index) => (
          <article key={label} className="rounded border border-white/10 bg-black/25 p-3">
            <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-accent-blue">item {index + 1}</div>
            <h3 className="text-sm font-semibold text-white">{label}</h3>
            <p className="mt-1 text-xs leading-5 text-white/50">
              Live backend data slots into this renderer through the sourceRef once
              the channel has fetched component data.
            </p>
          </article>
        ))}
      </div>
    </Panel>
  );
}

function SourcesBlock({ block, spec }: BlockProps) {
  return (
    <Panel block={block} icon={<Rows3 size={15} />}>
      <div className="grid gap-2">
        {spec.dataSources.map((source) => (
          <div key={source.id} className="flex items-center justify-between rounded border border-white/10 bg-black/25 px-3 py-2">
            <span className="text-sm text-white/75">{source.id}</span>
            <span className="text-xs text-white/40">{source.type}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function MarketTickerBlock({ block, spec }: BlockProps) {
  const source = spec.dataSources.find((item) => item.id === block.sourceRef);
  const selected = stringify(source?.constraints.selectedMarket || "BTC");
  return (
    <Panel block={block} icon={<Radio size={15} />}>
      <div className="flex gap-2 overflow-hidden">
        {["BTC", "ETH", "SOL", "HYPE", "DOGE", "XRP"].map((market) => (
          <span
            key={market}
            className={`shrink-0 rounded border px-3 py-2 text-sm ${
              market === selected
                ? "border-accent-green/40 bg-accent-green/15 text-accent-green"
                : "border-white/10 bg-black/25 text-white/55"
            }`}
          >
            {market}-PERP
          </span>
        ))}
      </div>
    </Panel>
  );
}

function ChartBlock({ block }: BlockProps) {
  const indicators = Array.isArray(block.props.indicators)
    ? block.props.indicators.map((item) => stringify(item))
    : [];
  return (
    <Panel block={block} icon={<BarChart3 size={15} />}>
      <div className="relative h-[320px] overflow-hidden rounded border border-white/10 bg-black/30 matrix-scanline">
        <svg viewBox="0 0 640 260" className="absolute inset-0 h-full w-full" role="img" aria-label="Market chart placeholder">
          <polyline
            points="0,190 60,170 120,196 180,126 240,144 300,82 360,110 420,72 480,96 540,54 640,70"
            fill="none"
            stroke="#00e87b"
            strokeWidth="3"
          />
          <polyline
            points="0,205 80,188 160,172 240,158 320,122 400,108 480,92 560,82 640,76"
            fill="none"
            stroke="#4d9eff"
            strokeDasharray="8 8"
            strokeWidth="2"
          />
        </svg>
        <div className="absolute bottom-3 left-3 flex flex-wrap gap-2">
          {indicators.map((indicator) => (
            <span key={indicator} className="rounded border border-accent-blue/30 bg-accent-blue/10 px-2 py-1 text-xs text-accent-blue">
              {indicator}
            </span>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function OrderbookBlock({ block }: { block: ChannelBlock }) {
  return (
    <Panel block={block} icon={<Activity size={15} />}>
      <DepthRows side="ask" />
      <div className="my-2 text-center font-heading text-xl text-accent-green">BTC 102,420.5</div>
      <DepthRows side="bid" />
    </Panel>
  );
}

function TradesBlock({ block }: { block: ChannelBlock }) {
  return (
    <Panel block={block} icon={<Activity size={15} />}>
      <div className="grid gap-2 text-xs">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="grid grid-cols-3 rounded bg-black/25 px-3 py-2 text-white/55">
            <span>{i % 2 ? "sell" : "buy"}</span>
            <span>0.{i + 2}4</span>
            <span className="text-right">102,{420 + i}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function FundingBlock({ block }: { block: ChannelBlock }) {
  return (
    <Panel block={block} icon={<CircleDollarSign size={15} />}>
      <div className="grid grid-cols-3 gap-3 text-center">
        {["Funding", "Open Int.", "Predicted"].map((label, index) => (
          <div key={label} className="rounded border border-white/10 bg-black/25 p-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">{label}</div>
            <div className="mt-2 font-heading text-xl text-white">{index === 0 ? "0.011%" : index === 1 ? "$1.8B" : "0.013%"}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function CaptionBlock({ block }: { block: ChannelBlock }) {
  return (
    <Panel block={block} icon={<Captions size={15} />}>
      <p className="text-sm leading-6 text-white/55">
        Captions are delivered as channel narration messages. The avatar layer
        may subscribe and speak them, but this panel remains usable without audio.
      </p>
    </Panel>
  );
}

function DepthRows({ side }: { side: "bid" | "ask" }) {
  return (
    <div className="grid gap-1">
      {[0, 1, 2].map((i) => (
        <div key={i} className="grid grid-cols-3 rounded bg-black/25 px-3 py-1 text-xs text-white/55">
          <span className={side === "bid" ? "text-accent-green" : "text-red-300"}>{side}</span>
          <span>102,{side === "bid" ? 410 - i : 430 + i}</span>
          <span className="text-right">{(4.2 + i).toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}
