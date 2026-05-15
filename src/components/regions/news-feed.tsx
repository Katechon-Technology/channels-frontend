"use client";

import { Newspaper } from "lucide-react";
import { extractNewsRows, getDataSource } from "@/lib/channel-data";
import type { RegionComponentProps } from "../component-registry";
import { EmptyState, Panel, readBoolean, readNumber } from "./_panel";

export default function NewsFeed({ region, channel }: RegionComponentProps) {
  const limit = Math.max(1, Math.min(24, Math.round(readNumber(region.props.limit, 6))));
  const density = region.props.density === "compact" ? "compact" : "comfortable";
  const showSource = readBoolean(region.props.showSource, true);
  const source = getDataSource(channel, region.sourceRef);
  const rows = extractNewsRows(source, limit);

  const title = typeof region.props.title === "string" ? region.props.title : undefined;
  return (
    <Panel title={title} icon={title ? <Newspaper size={15} /> : undefined}>
      {rows.length === 0 ? (
        <EmptyState
          message={
            source?.error
              ? `source "${region.sourceRef}" error: ${source.error}`
              : `waiting for ${region.sourceRef ?? "source"}…`
          }
        />
      ) : (
        <div className="grid h-full gap-2 overflow-y-auto">
          {rows.map((row, index) => (
            <article
              key={row.id}
              className={`rounded border border-white/10 bg-black/25 ${density === "compact" ? "p-2" : "p-3"}`}
            >
              {showSource ? (
                <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-accent-blue">
                  {row.source || `item ${index + 1}`}
                </div>
              ) : null}
              <h3 className="text-sm font-semibold text-white">{row.title}</h3>
              {density === "comfortable" && row.summary ? (
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/50">{row.summary}</p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}
