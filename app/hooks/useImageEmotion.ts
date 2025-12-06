import { useEffect, useState, useRef } from "react";

export type ImageState = {
  labels?: string[];
  running_avg?: number[];
  count?: number;
} | null;

export default function useImageEmotion(
  wsUrl = "ws://localhost:8000/ws/emotion",
  apiBase = "http://localhost:8000",
  captureIntervalMs = 10000
) {
  const [imageState, setImageState] = useState<ImageState>(null);

  // running average and count (exposed)
  const [imageAvg, setImageAvg] = useState<number[]>([0, 0, 0, 0]);
  const [imageCount, setImageCount] = useState<number>(0);

  // authoritative refs for atomic updates
  const imageAvgRef = useRef<number[]>([0, 0, 0, 0]);
  const imageCountRef = useRef<number>(0);

  const wsRef = useRef<WebSocket | null>(null);
  const intervalRef = useRef<number | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const connect = () => {
      if (wsRef.current) return;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => console.debug("image ws open");
      ws.onmessage = (ev) => {
        try {
          const payload = JSON.parse(ev.data);
          const img = payload?.image ?? payload;
          if (!img) return;

          // prefer server-provided running_avg/count
          if (Array.isArray(img.running_avg) && typeof img.count === "number") {
            const ra = img.running_avg.map((n: any) => Number(n) || 0);
            imageAvgRef.current = ra.slice();
            imageCountRef.current = Number(img.count) || 0;
            setImageAvg(imageAvgRef.current);
            setImageCount(imageCountRef.current);
            setImageState({ labels: img.labels ?? undefined, running_avg: ra, count: imageCountRef.current });
            console.debug("WS: used running_avg/count", ra, imageCountRef.current);
            return;
          }

          // fallback: if server still sends probs (legacy), compute running avg locally
          if (Array.isArray((img as any).probs) && (img as any).probs.length === 4) {
            const probs = (img as any).probs.map((v: any) => Number(v) || 0);
            const currentCount = imageCountRef.current;
            const nextCount = currentCount + 1;
            const prevAvg = imageAvgRef.current.length === 4 ? imageAvgRef.current.slice() : [0, 0, 0, 0];
            const newAvg = prevAvg.slice();
            for (let i = 0; i < 4; i++) {
              newAvg[i] = (prevAvg[i] * currentCount + probs[i]) / nextCount;
            }
            imageAvgRef.current = newAvg;
            imageCountRef.current = nextCount;
            setImageAvg(newAvg);
            setImageCount(nextCount);
            setImageState({ labels: img.labels ?? undefined, running_avg: newAvg, count: nextCount });
            console.debug("WS: updated local running avg from probs", newAvg, nextCount);
            return;
          }
        } catch (e) {
          console.warn("image ws parse error", e);
        }
      };
      ws.onclose = () => {
        wsRef.current = null;
        setTimeout(connect, 1000);
      };
      ws.onerror = () => ws.close();
    };

    connect();

    const ms = Number(captureIntervalMs) || 0;
    const intervalMs = Math.max(1000, Math.floor(ms));

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const doCapture = async () => {
      try {
        console.debug("doCapture: POST /capture-image");
        const res = await fetch(`${apiBase}/capture-image`, { method: "POST" });
        if (!res.ok) {
          console.warn("capture-image failed", res.status);
          return;
        }
        const data = await res.json();
        console.debug("capture-image raw response", data);
        const respImg: any = data?.image_state ?? data?.image ?? data;

        if (!respImg) {
          console.warn("capture-image: no image state in response");
          return;
        }

        // prefer running_avg/count from server
        if (Array.isArray(respImg.running_avg) && typeof respImg.count === "number") {
          const ra = respImg.running_avg.map((n: any) => Number(n) || 0);
          imageAvgRef.current = ra.slice();
          imageCountRef.current = Number(respImg.count) || 0;
          setImageAvg(imageAvgRef.current);
          setImageCount(imageCountRef.current);
          setImageState({ labels: respImg.labels ?? undefined, running_avg: ra, count: imageCountRef.current });
          console.debug("capture-image: used server running_avg/count", ra, imageCountRef.current);
          return;
        }

        // fallback: if server returns probs (legacy), update local running avg
        if (Array.isArray(respImg.probs) && respImg.probs.length === 4) {
          const probs = respImg.probs.map((v: any) => Number(v) || 0);
          const currentCount = imageCountRef.current;
          const nextCount = currentCount + 1;
          const prevAvg = imageAvgRef.current.length === 4 ? imageAvgRef.current.slice() : [0, 0, 0, 0];
          const newAvg = prevAvg.slice();
          for (let i = 0; i < 4; i++) {
            newAvg[i] = (prevAvg[i] * currentCount + probs[i]) / nextCount;
          }
          imageAvgRef.current = newAvg;
          imageCountRef.current = nextCount;
          setImageAvg(newAvg);
          setImageCount(nextCount);
          setImageState({ labels: respImg.labels ?? undefined, running_avg: newAvg, count: nextCount });
          console.debug("capture-image: updated local running avg from probs", newAvg, nextCount);
          return;
        }

        console.warn("capture-image: response format not recognized", respImg);
      } catch (e) {
        console.warn("doCapture error", e);
      }
    };

    if (!startedRef.current) {
      startedRef.current = true;
      doCapture(); // immediate first capture (optional)
      intervalRef.current = window.setInterval(doCapture, intervalMs);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (wsRef.current) {
        try { wsRef.current.close(); } catch {}
        wsRef.current = null;
      }
      startedRef.current = false;
    };
  }, [wsUrl, apiBase, captureIntervalMs]);

  return { imageState, imageAvg, imageCount };
}