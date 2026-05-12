"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function AvatarHost({ speechText }: { speechText?: string | null }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const lastSpeechRef = useRef<string>("");
  const [ready, setReady] = useState(false);

  const tuneAvatar = useCallback(() => {
    const frame = iframeRef.current?.contentWindow;
    if (!frame) return;
    frame.postMessage({ type: "unlock" }, "*");
    frame.postMessage({ type: "tune", scale: 0.42, yFactor: 1.08 }, "*");
    setReady(true);
  }, []);

  useEffect(() => {
    const text = cleanSpeechText(speechText);
    const frame = iframeRef.current?.contentWindow;
    if (!ready || !frame || !text || text === lastSpeechRef.current) return;
    lastSpeechRef.current = text;

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
            frame?.postMessage({ type: "audio", id: `story-${Date.now()}`, audio }, "*");
            return;
          }
        } catch {
          // Fall through to browser voice.
        }
      }

      frame?.postMessage({ type: "speak-text", text }, "*");
    }

    void speak();
    return () => controller.abort();
  }, [ready, speechText]);

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

function arrayBufferToBase64(buffer: ArrayBuffer): Promise<string> {
  return new Promise((resolve) => {
    const blob = new Blob([buffer]);
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(blob);
  });
}
