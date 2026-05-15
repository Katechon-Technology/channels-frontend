"use client";

import type { ReactNode } from "react";

/**
 * Shared chrome for region components — keeps every panel visually consistent
 * with the look the original `channel-blocks.tsx` established.
 */
export function Panel({
  title,
  icon,
  children,
  className = "",
}: {
  title?: string;
  icon?: ReactNode;
  /** Reserved for future debug chrome; currently never rendered. */
  sourceRef?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex h-full min-h-[120px] flex-col rounded-3xl border border-white/10 bg-surface-1/75 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.28)] backdrop-blur ${className}`}
    >
      {title ? (
        <div className="mb-3 flex min-w-0 items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/45">
          {icon ? <span className="text-accent-green">{icon}</span> : null}
          <span className="truncate">{title}</span>
        </div>
      ) : null}
      <div className="flex-1 min-h-0">{children}</div>
    </section>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="grid h-24 place-items-center rounded border border-white/5 bg-black/15 text-xs text-white/40">
      {message}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-white/10 bg-black/25 p-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">{label}</div>
      <div className="mt-2 font-heading text-xl text-white">{value}</div>
    </div>
  );
}

export function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function readNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function readBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

export function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const fractionDigits = abs >= 1000 ? 1 : abs >= 1 ? 2 : 4;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function compactCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatTimeAgo(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleString();
}
