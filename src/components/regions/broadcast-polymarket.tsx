"use client";

import { PolymarketBroadcast } from "../polymarket-broadcast";
import type { RegionComponentProps } from "../component-registry";

export default function BroadcastPolymarketRegion({
  channel,
  narration,
  narrationDriven,
}: RegionComponentProps) {
  return (
    <div className="h-full w-full overflow-hidden">
      <PolymarketBroadcast
        channel={channel}
        narration={narration ?? null}
        narrationDriven={narrationDriven}
      />
    </div>
  );
}
