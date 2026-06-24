const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

export interface Source {
  section: string;
  source: string;
  score: number;
  preview: string;
}

export interface ChatResponse {
  answer: string;
  sources: Source[];
  session_id: string;
  cached: boolean;
  latency_ms: number;
  model: string;
  error?: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  cached?: boolean;
  latency_ms?: number;
  isStreaming?: boolean;
}

export async function sendMessage(
  question: string,
  sessionId?: string
): Promise<ChatResponse> {
  const res = await fetch(`${API_URL}/api/chat/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, session_id: sessionId }),
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }

  return res.json();
}

export async function checkHealth() {
  const res = await fetch(`${API_URL}/api/health/`, { cache: "no-store" });
  return res.json();
}

/**
 * Synthesize speech for `text` via the LuxTTS voice-cloning service and return
 * an object URL for an <audio> element. Caller is responsible for revoking it.
 * Throws with the service's message if TTS is unavailable (e.g. no reference voice).
 */
export async function synthesizeSpeech(text: string): Promise<string> {
  const res = await fetch(`${API_URL}/api/tts/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    let detail = `TTS error: ${res.status}`;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail);
  }

  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export function streamMessage(
  question: string,
  sessionId: string | undefined,
  onToken: (token: string) => void,
  onSources: (sources: Source[]) => void,
  onDone: () => void,
  onError: (err: string) => void
): EventSource {
  const params = new URLSearchParams({ question });
  if (sessionId) params.set("session_id", sessionId);
  const url = `${API_URL}/api/chat/stream/?${params.toString()}`;
  const es = new EventSource(url);

  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === "sources") onSources(data.sources);
      else if (data.type === "token") onToken(data.token);
      else if (data.type === "done") {
        onDone();
        es.close();
      }
      // data.type === "session" is informational; the client already owns the id.
    } catch {}
  };

  es.onerror = () => {
    onError("Streaming connection lost.");
    es.close();
  };

  return es;
}
