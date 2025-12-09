from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import asyncio
import os
import sys
import threading
import image_emotion_detector

# import local module (gemini_emotion_detection.py is in the same folder)
from gemini_emotion_detection import FurhatDrivingAssistant
from recommender import recommend_top_n

app = FastAPI()
assistant = FurhatDrivingAssistant()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],  # ajustar a tu dev host
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# import local detector (file is in same folder)
from image_emotion_detector import ImageEmotionDetector

# create detector instance later (will be initialized after voice loop)
detector: Optional[ImageEmotionDetector] = None

# default labels used before detector exists
DEFAULT_LABELS = ["happy", "neutral", "angry", "sad"]

# background task handle (will be created on startup)
_bg_task: Optional[asyncio.Task] = None

async def _random_dataset_loop(detector: ImageEmotionDetector, interval: float = 10.0):
    """
    Background loop that selects a random real image from python_api/dataset/images
    and runs detection every `interval` seconds. Uses to_thread so blocking IO runs
    off the event loop.
    """
    base = os.path.dirname(__file__)
    dataset_dir = os.path.join(base, "dataset", "images")
    # If dataset doesn't exist, just sleep forever (avoids noisy exceptions)
    if not os.path.isdir(dataset_dir):
        while True:
            await asyncio.sleep(interval)
    while True:
        try:
            # run blocking detection in thread pool
            state = await asyncio.to_thread(detector.capture_random_from_dataset)
            # optionally: log minimal info (no heavy printing)
            print("dataset detection:", state.get("source"), file=os.sys.stdout)
        except Exception as e:
            # don't crash loop; log and continue
            print("dataset loop error:", e, file=os.sys.stderr)
        await asyncio.sleep(interval)

class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []
    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)
    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)
    async def broadcast(self, message: dict):
        dead = []
        for ws in list(self.active):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for d in dead:
            self.disconnect(d)

manager = ConnectionManager()

# schedule broadcasts from assistant
def _on_update(payload: dict):
    """
    Thread-safe: schedule manager.broadcast on the main event loop.
    Broadcast a combined payload with both assistant and image detector states so
    the frontend receives both in one message.
    """
    loop = getattr(manager, "loop", None)
    # safe retrieval of image state even if detector not initialized yet
    if detector:
        image_state = detector.get_state()
    else:
        image_state = {"labels": DEFAULT_LABELS, "probs": [0.0] * len(DEFAULT_LABELS)}

    combined = {"assistant": payload, "image": image_state}
    if loop is None:
        # fallback: try to get running loop (if called from an async context)
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

    if loop:
        try:
            asyncio.run_coroutine_threadsafe(manager.broadcast(combined), loop)
        except Exception as e:
            print("Failed to schedule broadcast:", e, file=sys.stderr)
    else:
        # best-effort: if we somehow are in the event loop, create a task
        try:
            asyncio.create_task(manager.broadcast(combined))
        except Exception as e:
            print("No loop available to broadcast:", e, file=sys.stderr)

assistant.on_update = _on_update

@app.get("/emotion")
def get_emotion():
    return assistant.get_emotion_state()

@app.websocket("/ws/emotion")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        # send combined state immediately (handle detector maybe None)
        image_state = detector.get_state() if detector else {"labels": DEFAULT_LABELS, "probs": [0.0]*len(DEFAULT_LABELS)}
        await websocket.send_json({
            "assistant": assistant.get_emotion_state(),
            "image": image_state
        })
        while True:
            # keep connection alive; clients don't need to send
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

def terminal_repl_loop(assistant: FurhatDrivingAssistant):
    print("Terminal REPL started. Commands: ask | msg:<text> | confirmmsg:<text> | quit")
    try:
        while True:
            try:
                line = input("> ").strip()
            except EOFError:
                break
            if not line:
                continue
            if line == "quit":
                print("Terminal REPL exiting.")
                break
            if line == "ask":
                # runs interactive flow (will prompt for Driver: inputs)
                try:
                    assistant.ask_mood()
                except Exception as e:
                    print("ask_mood error:", e, file=sys.stderr)
                continue
            if line.startswith("msg:"):
                text = line[len("msg:"):].strip()
                try:
                    state = assistant.receive_user_text(text, confirm=False)
                    print("Updated state:", state)
                except Exception as e:
                    print("receive_user_text error:", e, file=sys.stderr)
                continue
            if line.startswith("confirmmsg:"):
                text = line[len("confirmmsg:"):].strip()
                try:
                    state = assistant.receive_user_text(text, confirm=True)
                    print("Updated state:", state)
                except Exception as e:
                    print("receive_user_text(confirm) error:", e, file=sys.stderr)
                continue
            print("Unknown command. Use: ask | msg:<text> | confirmmsg:<text> | quit")
    except Exception as e:
        print("Terminal REPL fatal error:", e, file=sys.stderr)

# new endpoints to trigger image capture and read history
class CaptureResponse(BaseModel):
    image_state: dict

@app.post("/capture-image")
async def capture_image():
    """
    Trigger an image capture using a real image from python_api/dataset/images.
    """
    if detector is None:
        raise HTTPException(status_code=503, detail="Image detector not initialized yet")
    try:
        img_state = await asyncio.to_thread(detector.capture_random_from_dataset)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"capture failed: {e}")

    combined = {"assistant": assistant.get_emotion_state(), "image": img_state}
    await manager.broadcast(combined)
    return {"image_state": img_state}

@app.get("/image-history")
async def image_history():
    return detector.get_state()

@app.on_event("startup")
async def startup_event():
    global _bg_task, detector
    # store the running loop so other threads (REPL) can schedule coroutines
    manager.loop = asyncio.get_running_loop()

    # First: run the voice loop (ask_mood) and wait for it to finish.
    # This ensures image recognition initializes only after the voice flow completes.
    try:
        loop = asyncio.get_running_loop()
        # run blocking ask_mood off the event loop and await completion
        await loop.run_in_executor(None, assistant.ask_mood)
    except Exception as e:
        print("startup ask_mood error (continuing):", e, file=sys.stderr)

    # After the voice loop finished, initialize the image detector and background loop
    try:
        detector = ImageEmotionDetector()
    except Exception as e:
        print("Failed to initialize ImageEmotionDetector:", e, file=sys.stderr)
        detector = None

    if _bg_task is None and detector is not None:
        _bg_task = asyncio.create_task(_random_dataset_loop(detector, interval=10.0))

    # If terminal REPL requested, start it but don't call ask_mood again
    if os.environ.get("ENABLE_TERMINAL_INPUT", "0") == "1":
        def _start_repl_only():
            try:
                terminal_repl_loop(assistant)
            except Exception as e:
                print("terminal_repl_loop error:", e, file=sys.stderr)

        t = threading.Thread(target=_start_repl_only, daemon=True)
        t.start()

@app.on_event("shutdown")
async def shutdown_event():
    global _bg_task
    if _bg_task is not None:
        _bg_task.cancel()
        try:
            await _bg_task
        except asyncio.CancelledError:
            pass
        _bg_task = None

class RecommendRequest(BaseModel):
    current: List[float]
    target: List[float]
    n: int = 5
    w: float = 0.5
    method: str = "midpoint"

@app.post("/recommend")
async def recommend(req: RecommendRequest):
    # usar playlist.csv que está al lado de este módulo
    csv_path = os.path.join(os.path.dirname(__file__), "playlist.csv")
    # llamamos a recommend_top_n(current, target, n, w, method, csv_path)
    results = recommend_top_n(req.current, req.target, req.n, req.w, req.method, csv_path)
    # la función ya devuelve lista de dicts con los campos útiles
    return {"results": results}

@app.post("/ask")
async def http_ask():
    """
    Trigger assistant.ask_mood() in a background thread and return its result.
    """
    loop = asyncio.get_running_loop()
    # run blocking ask_mood in executor so it doesn't block the event loop
    result = await loop.run_in_executor(None, assistant.ask_mood)
    return {"result": result}