"use client"
import { useState } from "react"
import useAssistantEmotion from "../hooks/useAssistantEmotion"

export default function TargetEmotion() {
  const state = useAssistantEmotion()
  const [loading, setLoading] = useState(false)

  const labels = state?.labels ?? []

  const colorClasses = [
    "bg-yellow-400",
    "bg-blue-400",
    "bg-red-400",
    "bg-green-400",
    "bg-purple-400",
    "bg-pink-400",
    "bg-indigo-400",
  ]
  const bgColors = colorClasses.map((c) => c.replace("400", "500/20"))

  async function handleChangeMood() {
    try {
      // pause the image capture hook so terminal IO isn't contested
      window.dispatchEvent(new CustomEvent("assistant:pause-capture"))
      setLoading(true)

      const res = await fetch("http://localhost:8000/ask-change-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })

      if (!res.ok) {
        const text = await res.text()
        console.error(`HTTP ${res.status}: ${text}`)
      } else {
        const data = await res.json()
        console.debug("ask-change-mode response:", data)
        // frontend will receive updated state via websocket/useAssistantEmotion
      }
    } catch (e) {
      console.error("ask-change-mode error", e)
    } finally {
      setLoading(false)
      // resume image capture after interactive flow finishes
      window.dispatchEvent(new CustomEvent("assistant:resume-capture"))
    }
  }

  return (
    <div className="space-y-2">
      <div>
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-500 mb-2 uppercase tracking-wider font-mono">
            Target Emotion {state ? `(main: ${state.main})` : ""}
          </div>
          <button
            onClick={handleChangeMood}
            disabled={loading}
            className="text-xs px-3 py-1 ml-2 rounded bg-gray-800 text-white disabled:opacity-50"
            aria-busy={loading}
            title="Ask to change mood"
          >
            {loading ? "Asking..." : "Change mood"}
          </button>
        </div>
        {state && state.probs ? (
          <div className="space-y-2">
            {state.probs.map((v, i) => (
              <div key={i} className="space-y-0.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium capitalize text-gray-300">{labels[i] ?? `label-${i}`}</span>
                  <span className="text-xs font-mono" style={{ color: "#00ffff" }}>
                    {v.toFixed(3)}
                  </span>
                </div>
                <div className={`h-1.5 rounded-full ${bgColors[i % bgColors.length]} overflow-hidden backdrop-blur-sm`}>
                  <div
                    className={`h-full rounded-full ${colorClasses[i % colorClasses.length]} transition-all duration-300`}
                    style={{ width: `${Math.min(v * 100, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4 text-gray-500">
            <div className="text-xs">⏳ Awaiting voice input...</div>
          </div>
        )}
      </div>
    </div>
  )
}
