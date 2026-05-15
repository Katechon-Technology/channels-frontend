"use client";

import { Rows3 } from "lucide-react";
import type { RegionComponentProps } from "../component-registry";
import { Panel } from "./_panel";

export default function NewsSources({ region, channel }: RegionComponentProps) {
  const title = typeof region.props.title === "string" ? region.props.title : undefined;
  return (
    <Panel title={title} icon={title ? <Rows3 size={15} /> : undefined}>
      <div className="grid h-full gap-2 overflow-y-auto">
        {channel.spec.dataSources.map((source) => {
          const live = channel.dataSourcesData.find((d) => d.sourceId === source.id);
          const status = live?.error ? "error" : live?.lastRunAt ? "live" : "idle";
          return (
            <div
              key={source.id}
              className="flex items-center justify-between rounded border border-white/10 bg-black/25 px-3 py-2"
            >
              <span className="text-sm text-white/75">{source.id}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/40">{source.type}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${
                    status === "live"
                      ? "bg-accent-green/15 text-accent-green"
                      : status === "error"
                        ? "bg-red-500/15 text-red-300"
                        : "bg-white/5 text-white/40"
                  }`}
                >
                  {status}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
