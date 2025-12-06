"use client";
import React from "react";
import useImageEmotion from "../hooks/useImageEmotion";

export default function ImageDisplay() {
  const { imageAvg, imageCount } = useImageEmotion();

  const running = imageAvg ?? [0, 0, 0, 0];
  const labels = ["happy", "sad", "angry", "calm"];

  return (
    <div style={{ padding: 8 }}>
      <div>
        <strong>Running Average (count: {imageCount}):</strong>
        <div style={{ marginTop: 6 }}>
          {imageCount === 0 ? (
            <div>No captures yet</div>
          ) : (
            running.map((v, i) => (
              <span
                key={i}
                style={{ display: "inline-block", minWidth: 72, marginRight: 8 }}
              >
                {labels[i]}: {v.toFixed(3)}
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
}