"use client";

import { Radio } from "lucide-react";
import { extractMarketRows, readBlockMarkets } from "@/lib/channel-data";
import type { RegionComponentProps } from "../component-registry";
import { EmptyState, Panel, formatPrice } from "./_panel";

export default function MarketsTicker({ region, channel }: RegionComponentProps) {
  const declaredMarkets = readBlockMarkets({ props: region.props });
  const rows = extractMarketRows(channel, declaredMarkets);
  return (
    <Panel title="Top Markets" icon={<Radio size={15} />} sourceRef={region.sourceRef}>
      {rows.length === 0 ? (
        <EmptyState message="no markets curated" />
      ) : (
        <div className="flex h-full gap-2 overflow-x-auto">
          {rows.map((row) => (
            <div
              key={row.symbol}
              className="shrink-0 rounded border border-white/10 bg-black/25 px-3 py-2 text-sm text-white/65"
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
          ))}
        </div>
      )}
    </Panel>
  );
}
