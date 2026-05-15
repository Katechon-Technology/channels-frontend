"use client";

import { useEffect, useState } from "react";
import { Radio } from "lucide-react";
import type { RegionComponentProps } from "../component-registry";

const ACCENT_CLASS: Record<string, string> = {
  green: "text-accent-green border-accent-green/30",
  blue: "text-accent-blue border-accent-blue/30",
  amber: "text-accent-amber border-accent-amber/30",
};

export default function HeaderStation({ region, channel }: RegionComponentProps) {
  const kicker = typeof region.props.kicker === "string" ? region.props.kicker : "LIVE";
  const title =
    (typeof region.props.title === "string" && region.props.title.trim()) || channel.spec.title;
  const showClock = region.props.showClock !== false;
  const accent = ACCENT_CLASS[String(region.props.accent ?? "green")] ?? ACCENT_CLASS.green!;

  const [now, setNow] = useState<string>(() => formatClock());
  useEffect(() => {
    if (!showClock) return;
    setNow(formatClock());
    const id = window.setInterval(() => setNow(formatClock()), 1000);
    return () => window.clearInterval(id);
  }, [showClock]);

  return (
    <header
      className={`flex h-full items-center justify-between gap-3 rounded-3xl border bg-surface-1/80 px-6 py-3 shadow-[0_18px_45px_rgba(0,0,0,0.28)] backdrop-blur ${accent}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex items-center gap-2 rounded-full border border-current/40 bg-black/40 px-2 py-1 text-[10px] uppercase tracking-[0.18em]">
          <Radio size={12} className="animate-pulse" />
          {kicker}
        </span>
        <div className="min-w-0">
          <div className="truncate font-heading text-xl font-extrabold text-white">{title}</div>
        </div>
      </div>
      {showClock ? (
        <span className="font-body text-sm tabular-nums text-white/65">{now}</span>
      ) : null}
    </header>
  );
}

function formatClock(): string {
  const d = new Date();
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}
