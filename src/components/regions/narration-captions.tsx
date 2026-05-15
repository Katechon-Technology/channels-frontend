"use client";

import { Captions } from "lucide-react";
import { latestNarrationFor } from "@/lib/channel-data";
import type { RegionComponentProps } from "../component-registry";
import { Panel, formatTimeAgo, readNumber } from "./_panel";

export default function NarrationCaptions({ region, channel }: RegionComponentProps) {
  const maxLines = Math.max(1, Math.min(20, Math.round(readNumber(region.props.maxLines, 4))));
  const latest = latestNarrationFor(channel.narrationMessages);
  return (
    <Panel title="Narration" icon={<Captions size={15} />}>
      {latest ? (
        <div className="grid gap-2">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-accent-blue">
            <span>{latest.source}</span>
            <span className="text-white/35">{formatTimeAgo(latest.createdAt)}</span>
          </div>
          <p
            className="text-sm leading-6 text-white/85"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: maxLines,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {latest.text}
          </p>
        </div>
      ) : (
        <p className="text-sm leading-6 text-white/45">
          No narration yet. The narrator agent posts captions here when the broadcast advances and an
          API key is configured.
        </p>
      )}
    </Panel>
  );
}
