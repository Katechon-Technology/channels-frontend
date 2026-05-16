"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AvatarSpeechEvent = {
  speechKey: string;
  natural?: boolean;
  reason?: string;
};

type AvatarHostProps = {
  speechText?: string | null;
  speechKey?: string | null;
  onSpeechStart?: (event: AvatarSpeechEvent) => void;
  onSpeechEnd?: (event: AvatarSpeechEvent) => void;
};

export function AvatarHost({
  speechText,
  speechKey,
  onSpeechStart,
  onSpeechEnd,
}: AvatarHostProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const lastSpeechKeyRef = useRef<string>("");
  const pendingSpeechKeyRef = useRef<string | null>(null);
  const safetyTimerRef = useRef<number | null>(null);
  const onSpeechStartRef = useRef(onSpeechStart);
  const onSpeechEndRef = useRef(onSpeechEnd);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onSpeechStartRef.current = onSpeechStart;
  }, [onSpeechStart]);

  useEffect(() => {
    onSpeechEndRef.current = onSpeechEnd;
  }, [onSpeechEnd]);

  const clearSafetyTimer = useCallback(() => {
    if (safetyTimerRef.current !== null) {
      window.clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
  }, []);

  const scheduleSafetyEnd = useCallback(
    (key: string, text: string, delayMs = estimateSpeechMs(text) + 8_000) => {
      clearSafetyTimer();
      safetyTimerRef.current = window.setTimeout(() => {
        if (pendingSpeechKeyRef.current !== key) return;
        pendingSpeechKeyRef.current = null;
        onSpeechEndRef.current?.({ speechKey: key, natural: true, reason: "safety-timeout" });
      }, delayMs);
    },
    [clearSafetyTimer],
  );

  const tuneAvatar = useCallback(() => {
    const frame = iframeRef.current?.contentWindow;
    if (!frame) return;
    frame.postMessage({ type: "unlock" }, "*");
    frame.postMessage({ type: "tune", scale: 0.42, yFactor: 1.08 }, "*");
    setReady(true);
  }, []);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (!event.data || typeof event.data !== "object") return;
      const data = event.data as {
        type?: unknown;
        id?: unknown;
        natural?: unknown;
        reason?: unknown;
        durationMs?: unknown;
      };
      const type = typeof data.type === "string" ? data.type : "";
      const key = typeof data.id === "string" ? data.id : null;
      if (!key) return;

      if (type === "audio-started" || type === "speech-started") {
        if (pendingSpeechKeyRef.current !== key) return;
        const durationMs =
          typeof data.durationMs === "number" && Number.isFinite(data.durationMs)
            ? Math.max(0, data.durationMs)
            : null;
        if (durationMs !== null) scheduleSafetyEnd(key, "", durationMs + 4_000);
        onSpeechStartRef.current?.({ speechKey: key, natural: true });
      }

      if (type === "audio-ended" || type === "speech-ended") {
        if (pendingSpeechKeyRef.current !== key) return;
        const reason = typeof data.reason === "string" ? data.reason : undefined;
        pendingSpeechKeyRef.current = null;
        clearSafetyTimer();
        onSpeechEndRef.current?.({
          speechKey: key,
          natural: data.natural !== false,
          ...(reason ? { reason } : {}),
        });
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [clearSafetyTimer, scheduleSafetyEnd]);

  useEffect(() => () => clearSafetyTimer(), [clearSafetyTimer]);

  useEffect(() => {
    const text = cleanSpeechText(speechText);
    const frame = iframeRef.current?.contentWindow;
    const key = speechKey || (text ? `text:${text}` : "");
    if (!ready || !frame) return;
    if (!text || !key) {
      if (pendingSpeechKeyRef.current) {
        pendingSpeechKeyRef.current = null;
        clearSafetyTimer();
        frame.postMessage({ type: "stop" }, "*");
      }
      lastSpeechKeyRef.current = "";
      return;
    }
    if (key === lastSpeechKeyRef.current) return;
    lastSpeechKeyRef.current = key;
    pendingSpeechKeyRef.current = key;

    const controller = new AbortController();
    const provider = process.env.NEXT_PUBLIC_TTS_PROVIDER || "elevenlabs";

    async function speak() {
      if (provider !== "browser") {
        try {
          const response = await fetch("/api/tts", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ text }),
            signal: controller.signal,
          });
          if (response.ok) {
            const audio = await arrayBufferToBase64(await response.arrayBuffer());
            frame?.postMessage({ type: "audio", id: key, audio }, "*");
            scheduleSafetyEnd(key, text);
            return;
          }
        } catch {
          if (controller.signal.aborted) return;
          // Fall through to browser voice.
        }
      }

      if (controller.signal.aborted) return;
      frame?.postMessage({ type: "speak-text", id: key, text }, "*");
      scheduleSafetyEnd(key, text);
    }

    void speak();
    return () => controller.abort();
  }, [clearSafetyTimer, ready, scheduleSafetyEnd, speechKey, speechText]);

  return (
    <div className="pointer-events-none fixed bottom-0 right-0 z-30 hidden h-[min(88vh,980px)] w-[min(36vw,600px)] overflow-hidden lg:block">
      <div className="absolute bottom-2 right-8 h-24 w-56 rounded-[100%] bg-black/35 blur-xl" />
      <iframe
        ref={iframeRef}
        title="Katechon host"
        src="/avatar-pet.html?w=600&h=980"
        onLoad={tuneAvatar}
        className="absolute inset-0 h-full w-full border-0 bg-transparent"
        allow="autoplay"
      />
    </div>
  );
}

function cleanSpeechText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, 520);
}

function estimateSpeechMs(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  const byWords = (words / 2.4) * 1000;
  const byChars = text.length * 65;
  return Math.min(70_000, Math.max(7_000, Math.round(Math.max(byWords, byChars))));
}

function arrayBufferToBase64(buffer: ArrayBuffer): Promise<string> {
  return new Promise((resolve) => {
    const blob = new Blob([buffer]);
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(blob);
  });
}
