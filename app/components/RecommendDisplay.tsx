"use client";
import React, { useEffect, useRef, useState } from "react";
import useImageEmotion from "../hooks/useImageEmotion";
import useAssistantEmotion from "../hooks/useAssistantEmotion";

type Song = {
  score: number;
  song_id?: string;
  title?: string;
  artist?: string;
  uri?: string;
  vec?: number[];
};

export default function RecommendDisplay() {
  const assistantState = useAssistantEmotion();
  const { imageAvg, imageCount } = useImageEmotion();

  const [results, setResults] = useState<Song[]>([]);
  const [status, setStatus] = useState<string>("idle");
  const [lastResponse, setLastResponse] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const lastReqRef = useRef(0);
  const MIN_INTERVAL_MS = 1500; // throttle requests
  const PERIOD_MS = 30_000; // 30 seconds

  // refs to keep latest values for interval callback
  const assistantRef = useRef(assistantState);
  const imageAvgRef = useRef(imageAvg);
  const imageCountRef = useRef(imageCount);

  useEffect(() => { assistantRef.current = assistantState; }, [assistantState]);
  useEffect(() => { imageAvgRef.current = imageAvg; }, [imageAvg]);
  useEffect(() => { imageCountRef.current = imageCount; }, [imageCount]);

  // helper: build payload
  const buildPayload = () => {
    const asst = assistantRef.current;
    const imgAvg = imageAvgRef.current;
    const current = imgAvg ?? [0, 0, 0, 0];
    const target = (asst?.probs) ?? [0, 0, 0, 0];
    return { current, target, n: 6, w: 0.5, method: "midpoint" };
  };

  // function that uses refs so it's safe to call from interval
  const doRecommend = async () => {
    if (loadingRef.current) return;
    const now = Date.now();
    if (now - lastReqRef.current < MIN_INTERVAL_MS) return;

    const asst = assistantRef.current;
    const imgCount = imageCountRef.current;

    // show debug state
    setStatus("checking prerequisites");
    setErrorMsg(null);

    if (!asst) {
      setStatus("no assistant state (waiting websocket)");
      console.debug("Recommend aborted: no assistant state");
      return;
    }
    if (imgCount === 0) {
      setStatus("no image captures yet (imageCount=0)");
      console.debug("Recommend aborted: imageCount=0");
      return;
    }

    const payload = buildPayload();
    loadingRef.current = true;
    setStatus("requesting");
    try {
      console.debug("Recommend: POST /recommend payload", payload);
      // use absolute backend URL to avoid proxy problems
      const res = await fetch("http://localhost:8000/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      lastReqRef.current = Date.now();

      if (!res.ok) {
        const text = await res.text();
        setErrorMsg(`HTTP ${res.status}: ${text}`);
        setResults([]);
        setLastResponse(null);
        setStatus("error");
        console.warn("Recommend failed:", res.status, text);
      } else {
        const data = await res.json();
        setResults(Array.isArray(data?.results) ? data.results : []);
        setLastResponse(data);
        setStatus("ok");
        console.debug("Recommend response", data);
      }
    } catch (e: any) {
      setErrorMsg(String(e));
      setResults([]);
      setLastResponse(null);
      setStatus("error");
      console.warn("Recommend request error", e);
    } finally {
      loadingRef.current = false;
    }
  };

  // immediate recommend when values change
  useEffect(() => {
    doRecommend();
    // run when these change (they update refs too)
  }, [assistantState, imageAvg, imageCount]);

  // periodic recommend every PERIOD_MS
  useEffect(() => {
    const id = setInterval(() => {
      doRecommend();
    }, PERIOD_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ padding: 8 }}>
      <strong>Top recommendations</strong>

      <div style={{ marginTop: 8, fontSize: 13, color: "#333" }}>
        <div>status: {status}</div>
        <div>imageCount: {imageCount}</div>
        <div>imageAvg: {(imageAvg ?? [0,0,0,0]).map(v => v.toFixed(3)).join(", ")}</div>
        <div>assistant.probs: {(assistantState?.probs ?? ["—"]).map((v:any)=>Number(v).toFixed?.(3) ?? String(v)).join(", ")}</div>
        <div style={{ marginTop: 6 }}>
          <button onClick={() => doRecommend()} style={{ marginRight: 8 }}>Recommend now</button>
          <button onClick={() => { setResults([]); setLastResponse(null); setStatus("cleared"); }}>Clear</button>
        </div>
        {errorMsg && <div style={{ color: "crimson", marginTop: 6 }}>Error: {errorMsg}</div>}
      </div>

      <div style={{ marginTop: 12 }}>
        {results.length === 0 ? (
          <div style={{ marginTop: 8 }}>No recommendations yet</div>
        ) : (
          <ul style={{ marginTop: 8, paddingLeft: 18 }}>
            {results.map((s, i) => (
              <li key={s.song_id ?? i} style={{ marginBottom: 10 }}>
                <div><strong>{s.title ?? "Unknown"}</strong> — {s.artist ?? "Unknown"}</div>
                <div style={{ fontSize: 13, color: "#555" }}>
                  score: {typeof s.score === "number" ? s.score.toFixed(4) : "—"}
                  {"  "} | uri: {s.uri ? (
                    <a href={s.uri} target="_blank" rel="noreferrer">open</a>
                  ) : "—"}
                </div>
                <div style={{ fontSize: 13, color: "#444", marginTop: 4 }}>
                  emo: {(s.vec ?? []).map((v) => Number(v).toFixed(3)).join(", ")}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
        <details>
          <summary>Raw last response</summary>
          <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(lastResponse, null, 2)}</pre>
        </details>
      </div>
    </div>
  );
}