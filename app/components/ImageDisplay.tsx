"use client"
import useImageEmotion from "../hooks/useImageEmotion"

export default function ImageDisplay() {
  const { imageAvg, imageCount } = useImageEmotion()

  const running = imageAvg ?? [0, 0, 0, 0]
  const labels = ["happy", "sad", "angry", "calm"]
  const colors = ["bg-yellow-400", "bg-blue-400", "bg-red-400", "bg-green-400"]
  const bgColors = ["bg-yellow-500/20", "bg-blue-500/20", "bg-red-500/20", "bg-green-500/20"]

  return (
    <div className="space-y-2">
      <div>
        <div className="text-xs text-gray-500 mb-2 uppercase tracking-wider font-mono">
          Emotion Detection ({imageCount} samples)
        </div>
        {imageCount === 0 ? (
          <div className="text-center py-4 text-gray-500">
            <div className="text-xs">⏳ Awaiting camera input...</div>
          </div>
        ) : (
          <div className="space-y-2">
            {running.map((v, i) => (
              <div key={i} className="space-y-0.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium capitalize text-gray-300">{labels[i]}</span>
                  <span className="text-xs font-mono" style={{ color: "#00ffff" }}>
                    {v.toFixed(3)}
                  </span>
                </div>
                <div className={`h-1.5 rounded-full ${bgColors[i]} overflow-hidden backdrop-blur-sm`}>
                  <div
                    className={`h-full rounded-full ${colors[i]} transition-all duration-300`}
                    style={{ width: `${Math.min(v * 100, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
