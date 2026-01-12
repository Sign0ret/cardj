"use client"
import { useEffect, useRef, useState } from "react"
import useImageEmotion from "../hooks/useImageEmotion"
import useAssistantEmotion from "../hooks/useAssistantEmotion"

type Song = {
  score: number
  song_id?: string
  title?: string
  artist?: string
  uri?: string
  vec?: number[]
}

export default function RecommendDisplay() {
  const assistantState = useAssistantEmotion()
  const { imageAvg, imageCount } = useImageEmotion()
  
  const [results, setResults] = useState<Song[]>([])
  const [status, setStatus] = useState<string>("idle")
  const [lastResponse, setLastResponse] = useState<any>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const loadingRef = useRef(false)
  const lastReqRef = useRef(0)
  const MIN_INTERVAL_MS = 1500
  const PERIOD_MS = 30_000

  const assistantRef = useRef(assistantState)
  const imageAvgRef = useRef(imageAvg)
  const imageCountRef = useRef(imageCount)

  useEffect(() => {
    assistantRef.current = assistantState
  }, [assistantState])
  useEffect(() => {
    imageAvgRef.current = imageAvg
  }, [imageAvg])
  useEffect(() => {
    imageCountRef.current = imageCount
  }, [imageCount])

  const buildPayload = () => {
    const asst = assistantRef.current
    const imgAvg = imageAvgRef.current
    const current = imgAvg ?? [0, 0, 0, 0]
    const target = asst?.probs ?? [0, 0, 0, 0]
    return { current, target, n: 6, w: 0.5, method: "midpoint" }
  }

  const doRecommend = async () => {
    if (loadingRef.current) return
    const now = Date.now()
    if (now - lastReqRef.current < MIN_INTERVAL_MS) return

    const asst = assistantRef.current
    const imgCount = imageCountRef.current

    setStatus("checking prerequisites")
    setErrorMsg(null)

    if (!asst) {
      setStatus("no assistant state (waiting websocket)")
      return
    }
    if (imgCount === 0) {
      setStatus("no image captures yet (imageCount=0)")
      return
    }

    const payload = buildPayload()
    loadingRef.current = true
    setStatus("requesting")
    try {
      const res = await fetch("http://localhost:8000/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      lastReqRef.current = Date.now()

      if (!res.ok) {
        const text = await res.text()
        setErrorMsg(`HTTP ${res.status}: ${text}`)
        setResults([])
        setLastResponse(null)
        setStatus("error")
      } else {
        const data = await res.json()
        setResults(Array.isArray(data?.results) ? data.results : [])
        setLastResponse(data)
        setStatus("ok")
      }
    } catch (e: any) {
      setErrorMsg(String(e))
      setResults([])
      setLastResponse(null)
      setStatus("error")
    } finally {
      loadingRef.current = false
    }
  }

  useEffect(() => {
    doRecommend()
  }, [assistantState, imageAvg, imageCount])

  useEffect(() => {
    const id = setInterval(() => {
      doRecommend()
    }, PERIOD_MS)
    return () => clearInterval(id)
  }, [])

  const statusColors: Record<string, string> = {
    ok: "#22c55e",
    requesting: "#eab308",
    error: "#ef4444",
    idle: "#06b6d4",
  }

  return (
    <div className="space-y-2">
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <div
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ backgroundColor: statusColors[status] || statusColors.idle }}
          />
          <span className="text-xs uppercase tracking-wider text-gray-400 font-mono">{status}</span>
        </div>

        <div className="text-xs text-gray-500 space-y-0.5">
          <div>
            <span className="text-gray-400">Samples:</span>{" "}
            <span className="font-mono" style={{ color: "#00ffff" }}>
              {imageCount}
            </span>
          </div>
          <div>
            <span className="text-gray-400">Avg:</span>{" "}
            <span className="font-mono text-xs" style={{ color: "#00ffff" }}>
              {(imageAvg ?? [0, 0, 0, 0]).map((v) => v.toFixed(3)).join(", ")}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {results.length === 0 ? (
          <div className="text-center py-3 text-gray-500">
            <div className="text-xs">🎵 No recommendations yet</div>
          </div>
        ) : (
          <ul className="space-y-1">
            {results.map((s, i) => (
              <li
                key={s.song_id ?? i}
                className="border border-cyan-500/30 rounded p-2 hover:border-cyan-400/60 transition-colors bg-black/50"
              >
                <div className="flex gap-1.5">
                  <div className="text-xs font-mono text-cyan-500/60 flex-shrink-0">#{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-gray-200 truncate">{s.title ?? "Unknown"}</div>
                    <div className="text-xs text-gray-500 truncate">{s.artist ?? "Unknown"}</div>
                    {s.uri && (
                      <a
                        href={s.uri}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs transition-colors mt-0.5 inline-block"
                        style={{ color: "#00ffff" }}
                      >
                        → Open
                      </a>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {errorMsg && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded p-1.5">{errorMsg}</div>
      )}

      <button
        onClick={() => doRecommend()}
        className="w-full px-2 py-1 text-xs rounded transition-all font-medium border"
        style={{
          backgroundColor: "rgba(0, 255, 255, 0.1)",
          borderColor: "rgba(0, 255, 255, 0.5)",
          color: "#00ffff",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(0, 255, 255, 0.2)")}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "rgba(0, 255, 255, 0.1)")}
      >
        Refresh
      </button>
    </div>
  )
}
