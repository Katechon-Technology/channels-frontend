"use client";

import { HyperliquidBroadcast } from "../hyperliquid-broadcast";
import type { RegionComponentProps } from "../component-registry";

export default function BroadcastHyperliquidRegion({
  channel,
  narration,
  narrationDriven,
}: RegionComponentProps) {
  return (
    <div className="h-full w-full overflow-hidden">
      <HyperliquidBroadcast
        channel={channel}
        narration={narration ?? null}
        narrationDriven={narrationDriven}
      />
    </div>
  );
}
