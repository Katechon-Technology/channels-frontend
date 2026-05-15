"use client";

import { PolymarketBroadcast } from "../polymarket-broadcast";
import type { RegionComponentProps } from "../component-registry";

export default function BroadcastPolymarketRegion({ channel }: RegionComponentProps) {
  return (
    <div className="h-full w-full overflow-hidden">
      <PolymarketBroadcast channel={channel} />
    </div>
  );
}
