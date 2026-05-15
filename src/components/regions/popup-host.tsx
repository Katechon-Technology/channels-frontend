"use client";

import { useEffect, useMemo, useState } from "react";
import type { RegionComponentProps } from "../component-registry";
import type { ChannelNarrationMessage } from "@/lib/types";

const POSITION_CLASS: Record<string, string> = {
  "top-left": "top-6 left-6",
  "top-right": "top-6 right-6",
  "bottom-left": "bottom-6 left-6",
  "bottom-right": "bottom-6 right-6",
  center: "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
};

const MODE_CLASS: Record<string, string> = {
  toast: "max-w-sm bg-surface-1/90 border border-accent-green/25 text-white",
  alert: "max-w-md bg-red-900/85 border border-red-400/40 text-white",
  "lower-third": "max-w-3xl bg-black/85 border border-white/15 text-white px-8 py-5",
};

type ActivePopup = {
  id: string;
  text: string;
  source: string;
  shownAt: number;
};

export default function PopupHost({ region, channel }: RegionComponentProps) {
  const mode = String(region.props.mode ?? "toast");
  const position = String(region.props.position ?? "bottom-right");
  const durationMs = Math.max(0, Math.round(Number(region.props.durationMs) || 5000));
  const triggerOn = String(region.props.triggerOn ?? "narration");
  const match = typeof region.props.match === "string" ? region.props.match : "";

  const matcher = useMemo(() => buildMatcher(match), [match]);
  const [active, setActive] = useState<ActivePopup | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Watch for new narration messages
  useEffect(() => {
    if (triggerOn === "agent-event") return; // skip narration trigger entirely
    const latest = pickLatest(channel.narrationMessages, matcher);
    if (!latest) return;
    if (dismissed.has(latest.id)) return;
    if (active?.id === latest.id) return;
    setActive({
      id: latest.id,
      text: latest.text,
      source: latest.source,
      shownAt: Date.now(),
    });
  }, [channel.narrationMessages, matcher, triggerOn, dismissed, active?.id]);

  // Auto-dismiss after durationMs (0 = manual)
  useEffect(() => {
    if (!active || durationMs <= 0) return;
    const id = window.setTimeout(() => {
      setDismissed((prev) => new Set(prev).add(active.id));
      setActive(null);
    }, durationMs);
    return () => window.clearTimeout(id);
  }, [active, durationMs]);

  if (!active) return null;

  return (
    <div
      className={`pointer-events-auto absolute ${POSITION_CLASS[position] ?? POSITION_CLASS["bottom-right"]} z-50`}
    >
      <div
        className={`rounded-2xl p-4 shadow-[0_18px_45px_rgba(0,0,0,0.5)] backdrop-blur boot-in ${MODE_CLASS[mode] ?? MODE_CLASS.toast}`}
      >
        <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/55">
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent-green" />
          <span>{active.source}</span>
        </div>
        <p className="text-sm leading-6">{active.text}</p>
        {durationMs <= 0 ? (
          <button
            type="button"
            className="mt-3 rounded-full border border-white/20 bg-black/30 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-white/75 hover:bg-white/10"
            onClick={() => {
              setDismissed((prev) => new Set(prev).add(active.id));
              setActive(null);
            }}
          >
            dismiss
          </button>
        ) : null}
      </div>
    </div>
  );
}

function buildMatcher(pattern: string): ((text: string) => boolean) | null {
  const trimmed = pattern.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/") && trimmed.lastIndexOf("/") > 0) {
    const last = trimmed.lastIndexOf("/");
    const body = trimmed.slice(1, last);
    const flags = trimmed.slice(last + 1);
    try {
      const re = new RegExp(body, flags);
      return (text) => re.test(text);
    } catch {
      // fall through to substring
    }
  }
  const lower = trimmed.toLowerCase();
  return (text) => text.toLowerCase().includes(lower);
}

function pickLatest(
  messages: ChannelNarrationMessage[] | null | undefined,
  matcher: ((text: string) => boolean) | null,
): ChannelNarrationMessage | null {
  if (!messages?.length) return null;
  const sorted = [...messages].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
  if (!matcher) return sorted[0] ?? null;
  return sorted.find((m) => matcher(m.text)) ?? null;
}
