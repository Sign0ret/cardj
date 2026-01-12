"use client"

import { useEffect, useState } from "react"
import AssistantDisplay from "@/app/components/AssistantDisplay"
import ImageDisplay from "@/app/components/ImageDisplay"
import RecommendDisplay from "@/app/components/RecommendDisplay"
import TargetEmotion from "./components/TargetEmotion"

export default function Home() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return (
    <div className="w-full h-screen bg-black text-foreground overflow-hidden flex flex-col">
      {/* Header */}
      <header className="border-b border-cyan-500/20 backdrop-blur-sm px-4 py-2 bg-black/80 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tighter" style={{ textShadow: "0 0 10px rgba(0, 255, 255, 0.5)" }}>
            <span style={{ color: "#00ffff" }}>⚡ CAR DJ</span>
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Real-time emotion detection × Music recommendations</p>
        </div>
      </header>

      <main className="flex-1 w-full px-3 py-3 overflow-hidden">
        <div className="grid grid-cols-1 gap-3 h-full">
          {/* Left: Player */}
          {/* <div className="col-span-2 flex flex-col min-h-0">
            <div
              className="flex-1 bg-black border border-cyan-500/30 rounded-lg overflow-hidden backdrop-blur-sm flex flex-col"
              style={{
                boxShadow: "0 0 20px rgba(0, 255, 255, 0.2), inset 0 0 20px rgba(0, 255, 255, 0.05)",
              }}
            >
              <AssistantDisplay />
            </div>
          </div> */}

          {/* Right column: stacked sections */}
          <div className="flex flex-col gap-3 min-h-0">
            {/* Top Right: Image Emotion Display */}
            <div
              className="flex-1 bg-black border border-purple-500/30 rounded-lg p-3 backdrop-blur-sm overflow-hidden flex flex-col min-h-0"
              style={{
                boxShadow: "0 0 20px rgba(168, 85, 247, 0.2), inset 0 0 20px rgba(168, 85, 247, 0.05)",
              }}
            >
              <div className="flex-shrink-0">
                <h2 className="text-sm font-bold mb-1 flex items-center gap-2" style={{ color: "#00ffff" }}>
                  <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse"></span>
                  LIVE EMOTION
                </h2>
                <p className="text-xs text-gray-500">Detected from facial expressions</p>
              </div>
              <div className="flex-1 overflow-auto min-h-0 mt-2">
                <ImageDisplay />
              </div>
              <div className="flex-1 overflow-auto min-h-0 mt-2">
                <TargetEmotion />
              </div>
            </div>

            {/* Bottom Right: Recommendations */}
            <div
              className="flex-1 bg-black border border-cyan-500/30 rounded-lg p-3 backdrop-blur-sm overflow-hidden flex flex-col min-h-0"
              style={{
                boxShadow: "0 0 20px rgba(0, 255, 255, 0.2), inset 0 0 20px rgba(0, 255, 255, 0.05)",
              }}
            >
              <div className="flex-shrink-0">
                <h2 className="text-sm font-bold mb-1 flex items-center gap-2" style={{ color: "#a855f7" }}>
                  <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse"></span>
                  RECOMMENDATIONS
                </h2>
                <p className="text-xs text-gray-500">AI-matched to your mood</p>
              </div>
              <div className="flex-1 overflow-auto min-h-0 mt-2">
                <RecommendDisplay />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
