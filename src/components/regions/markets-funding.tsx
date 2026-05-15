"use client";

import { CircleDollarSign } from "lucide-react";
import { getDataSource } from "@/lib/channel-data";
import type { RegionComponentProps } from "../component-registry";
import { Panel, Stat, compactCurrency, readBoolean } from "./_panel";

export default function MarketsFunding({ region, channel }: RegionComponentProps) {
  const source = getDataSource(channel, region.sourceRef);
  const showPredicted = readBoolean(region.props.showPredicted, true);
  const stats = readFundingFromSource(source);
  return (
    <Panel title="Funding" icon={<CircleDollarSign size={15} />} sourceRef={region.sourceRef}>
      <div className={`grid gap-3 text-center ${showPredicted ? "grid-cols-3" : "grid-cols-2"}`}>
        <Stat
          label="Funding"
          value={stats.funding === null ? "—" : `${(stats.funding * 100).toFixed(4)}%`}
        />
        <Stat
          label="Open Int."
          value={stats.openInterest === null ? "—" : compactCurrency(stats.openInterest)}
        />
        {showPredicted ? (
          <Stat
            label="Predicted"
            value={stats.predicted === null ? "—" : `${(stats.predicted * 100).toFixed(4)}%`}
          />
        ) : null}
      </div>
    </Panel>
  );
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
