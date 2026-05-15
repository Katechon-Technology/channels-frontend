"use client";

import { BookOpen } from "lucide-react";
import type { RegionComponentProps } from "../component-registry";
import { Panel, readString } from "./_panel";

export default function NewsBrief({ region, channel }: RegionComponentProps) {
  const spec = channel.spec;
  const focusLabel = readString(region.props.focus);
  const focus = spec.dataSources.flatMap((source) =>
    Object.entries(source.constraints).map(([key, value]) => `${key}: ${stringify(value)}`),
  );
  return (
    <Panel title={focusLabel || "Brief"} icon={<BookOpen size={15} />} sourceRef={region.sourceRef}>
      <div className="grid gap-3 text-sm text-white/70">
        <p className="font-heading text-2xl font-semibold text-white">{spec.title}</p>
        <p>
          The channel is constrained by the active source envelope. Incoming agent changes
          can tighten region, topic, event, and component selection.
        </p>
        <div className="flex flex-wrap gap-2">
          {focus.slice(0, 8).map((item) => (
            <span
              key={item}
              className="rounded border border-white/10 bg-black/25 px-2 py-1 text-xs text-white/55"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}
