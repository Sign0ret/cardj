"use client"
import { useEffect, useMemo, useRef, useState } from "react"
import useAssistantEmotion from "../hooks/useAssistantEmotion"

function normalizeTitle(s: unknown) {
  return typeof s === "string" ? s.toLowerCase().trim() : ""
}

function extractVideoIdFromUrl(url: string) {
  try {
    const u = new URL(url)
    if (u.hostname.includes("youtube.com")) {
      return u.searchParams.get("v") ?? undefined
    }
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.slice(1) || undefined
    }
  } catch {
    // not a URL
  }
  return undefined
}

function resolveYouTubeIdFromRec(rec: any) {
  if (!rec) return undefined
  const candidates = [rec.youtubeId, rec.videoId, rec.ytId, rec.yt, rec.id, rec.url, rec.link]
  for (const c of candidates) {
    if (!c) continue
    if (typeof c === "string") {
      const fromUrl = extractVideoIdFromUrl(c)
      if (fromUrl) return fromUrl
      if (/^[A-Za-z0-9_-]{6,}$/g.test(c)) return c
    }
  }
  return undefined
}

function getRecommendationsArray(state: any): any[] {
  const recs: any[] = state?.recommendations ?? state?.songs ?? state?.tracks ?? []
  if (!Array.isArray(recs)) return []
  const withScore = recs.filter((r) => typeof r.score === "number" || typeof r.prob === "number")
  if (withScore.length > 0) {
    return [...recs].sort((a, b) => (b.score ?? b.prob ?? 0) - (a.score ?? a.prob ?? 0))
  }
  return recs
}

function loadYouTubeIframeAPI(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve()
    if ((window as any).YT && (window as any).YT.Player) return resolve()
    const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]')
    if (existing) {
      const i = setInterval(() => {
        if ((window as any).YT && (window as any).YT.Player) {
          clearInterval(i)
          resolve()
        }
      }, 100)
      return
    }
    const tag = document.createElement("script")
    tag.src = "https://www.youtube.com/iframe_api"
    ;(window as any).onYouTubeIframeAPIReady = () => resolve()
    document.body.appendChild(tag)
  })
}

export default function AssistantDisplay() {
  const state = useAssistantEmotion()
  const playerRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [muted, setMuted] = useState(true)
  const [playing, setPlaying] = useState(true)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const playedIdsRef = useRef<Set<string>>(new Set())
  const [queue, setQueue] = useState<any[]>([])

  const recList = useMemo(() => getRecommendationsArray(state), [state])

  const pickNextFromRecs = (recs: any[]) => {
    for (const r of recs) {
      const id = resolveYouTubeIdFromRec(r)
      if (!id) continue
      if (playedIdsRef.current.has(id)) continue
      return { rec: r, id }
    }
    return null
  }

  const enqueueAndPlayTop = async () => {
    const next = pickNextFromRecs(recList)
    if (!next) return
    playedIdsRef.current.add(next.id)
    setQueue((q) => [...q, next.rec])
    await ensurePlayerAndLoad(next.id)
    setCurrentId(next.id)
    setPlaying(true)
  }

  const ensurePlayerAndLoad = async (videoId: string) => {
    await loadYouTubeIframeAPI()
    const YT = (window as any).YT
    if (!YT) return
    if (playerRef.current) {
      try {
        playerRef.current.loadVideoById(videoId)
        if (muted) playerRef.current.mute()
        else playerRef.current.unMute()
        return
      } catch {
        // fallthrough to recreate player
      }
    }
    playerRef.current = new YT.Player(containerRef.current!, {
      videoId,
      playerVars: {
        autoplay: 1,
        controls: 1,
        rel: 0,
        modestbranding: 1,
        mute: muted ? 1 : 0,
      },
      events: {
        onReady: (e: any) => {
          if (muted) e.target.mute()
          if (playing) e.target.playVideo()
        },
        onStateChange: (e: any) => {
          const YTState = YT.PlayerState
          if (e.data === YTState.ENDED) {
            handleVideoEnd()
          } else if (e.data === YTState.PLAYING) {
            setPlaying(true)
          } else if (e.data === YTState.PAUSED) {
            setPlaying(false)
          }
        },
      },
    })
  }

  const handleVideoEnd = () => {
    const next = pickNextFromRecs(getRecommendationsArray(state))
    if (!next) {
      setCurrentId(null)
      setPlaying(false)
      return
    }
    playedIdsRef.current.add(next.id)
    setQueue((q) => [...q, next.rec])
    if (playerRef.current && typeof playerRef.current.loadVideoById === "function") {
      try {
        playerRef.current.loadVideoById(next.id)
        setCurrentId(next.id)
        setPlaying(true)
        if (muted) playerRef.current.mute()
        else playerRef.current.unMute()
      } catch {
        setCurrentId(next.id)
        ensurePlayerAndLoad(next.id)
      }
    } else {
      setCurrentId(next.id)
      ensurePlayerAndLoad(next.id)
    }
  }

  useEffect(() => {
    if (!state) return
    if (currentId) return
    if (recList.length > 0) {
      enqueueAndPlayTop()
    }
  }, [state, recList])

  useEffect(() => {
    return () => {
      if (playerRef.current && typeof playerRef.current.destroy === "function") {
        playerRef.current.destroy()
        playerRef.current = null
      }
    }
  }, [])

  const togglePlay = () => {
    if (!playerRef.current) return
    const p = playerRef.current
    try {
      const stateCode = p.getPlayerState()
      if (stateCode === 1) {
        p.pauseVideo()
        setPlaying(false)
      } else {
        p.playVideo()
        setPlaying(true)
      }
    } catch {
      // ignore
    }
  }

  const toggleMute = () => {
    if (!playerRef.current) {
      setMuted((m) => !m)
      return
    }
    const p = playerRef.current
    try {
      if (p.isMuted && p.isMuted()) {
        p.unMute()
        setMuted(false)
      } else {
        p.mute()
        setMuted(true)
      }
    } catch {
      setMuted((m) => !m)
    }
  }

  const skipCurrent = () => {
    handleVideoEnd()
  }

  if (!state)
    return (
      <div className="h-full w-full flex items-center justify-center text-gray-500">
        <div className="text-center">
          <div className="text-sm">⏳ Connecting to emotion stream...</div>
        </div>
      </div>
    )

  const currentRec = queue.length > 0 ? queue[queue.length - 1] : undefined
  const displayTitle = currentRec?.title ?? currentRec?.name ?? state.main ?? "Now Playing"

  return (
    <div className="h-full w-full flex flex-col">
      <div className="flex-1 flex flex-col bg-black relative overflow-hidden">
        <div className="flex-1 relative bg-black">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black z-10 pointer-events-none" />
          <div ref={containerRef} className="w-full h-full">
            {!currentId && (
              <div className="w-full h-full flex items-center justify-center text-gray-500 flex-col gap-3">
                <div className="text-xl">🎵</div>
                <div className="text-xs">Awaiting emotion-matched track...</div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-gradient-to-t from-black to-transparent p-2 border-t border-cyan-500/20 backdrop-blur-sm z-20">
          <div className="space-y-2">
            <div className="min-h-10">
              <div
                className="text-xs font-bold text-gray-100 truncate"
                style={{ textShadow: "0 0 10px rgba(0, 255, 255, 0.3)" }}
              >
                {displayTitle}
              </div>
              <div className="text-xs text-gray-500 mt-0.5 truncate">
                {(state?.labels ?? []).join(" • ") || "Detecting emotion..."}
              </div>
            </div>

            <div className="flex gap-1.5 justify-center">
              <button
                onClick={togglePlay}
                className="px-3 py-1.5 rounded text-xs font-medium transition-all border"
                style={{
                  backgroundColor: "rgba(0, 255, 255, 0.15)",
                  borderColor: "rgba(0, 255, 255, 0.5)",
                  color: "#00ffff",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(0, 255, 255, 0.25)"
                  e.currentTarget.style.borderColor = "rgba(0, 255, 255, 0.8)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(0, 255, 255, 0.15)"
                  e.currentTarget.style.borderColor = "rgba(0, 255, 255, 0.5)"
                }}
              >
                {playing ? "⏸ Pause" : "▶ Play"}
              </button>

              <button
                onClick={toggleMute}
                className="px-3 py-1.5 rounded text-xs font-medium transition-all border"
                style={{
                  backgroundColor: "rgba(168, 85, 247, 0.15)",
                  borderColor: "rgba(168, 85, 247, 0.5)",
                  color: "#a855f7",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(168, 85, 247, 0.25)"
                  e.currentTarget.style.borderColor = "rgba(168, 85, 247, 0.8)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(168, 85, 247, 0.15)"
                  e.currentTarget.style.borderColor = "rgba(168, 85, 247, 0.5)"
                }}
              >
                {muted ? "🔇 Unmute" : "🔊 Mute"}
              </button>

              <button
                onClick={skipCurrent}
                className="px-3 py-1.5 rounded text-xs font-medium transition-all border"
                style={{
                  backgroundColor: "rgba(59, 130, 246, 0.15)",
                  borderColor: "rgba(59, 130, 246, 0.5)",
                  color: "#3b82f6",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(59, 130, 246, 0.25)"
                  e.currentTarget.style.borderColor = "rgba(59, 130, 246, 0.8)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(59, 130, 246, 0.15)"
                  e.currentTarget.style.borderColor = "rgba(59, 130, 246, 0.5)"
                }}
              >
                ⏭ Next
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-2 py-1.5 bg-black/50 border-t border-cyan-500/20 text-xs text-gray-500 flex-shrink-0">
        <div className="flex items-center justify-between">
          <span>📋 Queue</span>
          <span className="font-mono" style={{ color: "#00ffff" }}>
            {queue.length} tracks
          </span>
        </div>
      </div>
    </div>
  )
}
