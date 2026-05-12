import { NextResponse } from "next/server";

const ELEVENLABS_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

export async function POST(request: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ElevenLabs is not configured" }, { status: 501 });
  }

  const body = await request.json().catch(() => null) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.replace(/\s+/g, " ").trim().slice(0, 900) : "";
  if (!text) {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }

  const voiceId = process.env.ELEVENLABS_VOICE_ID || process.env.VOICE_ID || DEFAULT_VOICE_ID;
  const response = await fetch(`${ELEVENLABS_URL}/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "content-type": "application/json",
      accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.75,
        style: 0.2,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text().catch(() => "ElevenLabs request failed");
    return NextResponse.json({ error }, { status: response.status });
  }

  return new Response(await response.arrayBuffer(), {
    headers: {
      "content-type": response.headers.get("content-type") || "audio/mpeg",
      "cache-control": "no-store",
    },
  });
}
