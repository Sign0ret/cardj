"use client";
import useAssistantEmotion from "../hooks/useAssistantEmotion";

export default function AssistantDisplay() {
  const state = useAssistantEmotion();

  if (!state) return <div>Assistant: Connecting...</div>;

  return (
    <div style={{ padding: 8 }}>
      <div><strong>Assistant Main:</strong> {state.main ?? "—"}</div>
      <div><strong>Labels:</strong> {(state.labels ?? []).join(", ") || "—"}</div>
      <div><strong>Probs:</strong> {(state.probs ?? []).map(p => p.toFixed(2)).join(", ") || "—"}</div>
    </div>
  );
}