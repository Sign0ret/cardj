import { useEffect, useState, useRef } from "react";

export type AssistantState = {
  labels?: string[];
  probs?: number[];
  main?: string;
} | null;

export default function useAssistantEmotion(wsUrl = "ws://localhost:8000/ws/emotion") {
  const [state, setState] = useState<AssistantState>(null);
  const wsRef = useRef<WebSocket | null>(null);
  console.log("state", state);
  useEffect(() => {
    if (typeof window === "undefined") return;

    const connect = () => {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => console.log("assistant ws open");
      ws.onmessage = (ev) => {
        try {
          const payload = JSON.parse(ev.data);
          // server might send combined {assistant, image} or just assistant
          const assistant = payload?.assistant ?? payload;
          setState(assistant ?? null);
        } catch {
          // ignore malformed
        }
      };
      ws.onclose = () => {
        wsRef.current = null;
        setTimeout(connect, 1000);
      };
      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [wsUrl]);

  return state;
}