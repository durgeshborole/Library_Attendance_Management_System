from __future__ import annotations
import threading
import time
from typing import Optional
import os
import cv2
import numpy as np
import requests
from flask import Flask, Response, jsonify, request
from flask_cors import CORS

from simple_facerec import SimpleFacerec


# ══════════════════════════════════════════════════════════════════════════════
#  CONFIGURATION
# ══════════════════════════════════════════════════════════════════════════════

PORT                 = 5001
NODE_API_URL         = "http://localhost:5000/api/logs/attendance"
FACES_FOLDER         = "faces/"

CAMERA_INDEX         = 0        # 0 = built-in webcam
CAMERA_WIDTH         = 1280
CAMERA_HEIGHT        = 720
CAMERA_FPS           = 30

# ── KEY PERFORMANCE KNOB ─────────────────────────────────────────────────────
# Width of the thumbnail InsightFace processes.  Smaller = faster AI.
#   i5 → 480    i7 → 640    GPU → 960
AI_INFERENCE_WIDTH   = 480

STREAM_JPEG_QUALITY  = 75       # 70-80 is visually lossless and half the bytes
COOLDOWN_SECONDS     = 10       # Seconds before the same person is logged again
# ══════════════════════════════════════════════════════════════════════════════


# ──────────────────────────────────────────────────────────────────────────────
#  Shared state (all cross-thread data here, all mutations locked)
# ──────────────────────────────────────────────────────────────────────────────

class _State:
    def __init__(self):
        self._raw:          Optional[np.ndarray] = None
        self._annotated:    Optional[np.ndarray] = None
        self._raw_lock      = threading.Lock()
        self._ann_lock      = threading.Lock()

        self.face_locations = np.empty((0, 4), dtype=int)
        self.face_names:    list[str] = []
        self._res_lock      = threading.Lock()

        self._last_logged:  dict[str, float] = {}
        self._cd_lock       = threading.Lock()

        self.fps_cap = self.fps_ai = self.fps_str = 0.0
        self._fps_lock = threading.Lock()

    def put_raw(self, f: np.ndarray):
        with self._raw_lock:
            self._raw = f                        # O(1) reference swap

    def get_raw(self) -> Optional[np.ndarray]:
        with self._raw_lock:
            f, self._raw = self._raw, None       # consume — AI skips duplicates
        return f

    def put_annotated(self, f: np.ndarray):
        with self._ann_lock:
            self._annotated = f

    def get_annotated(self) -> Optional[np.ndarray]:
        with self._ann_lock:
            return self._annotated               # non-consuming; stream reads latest

    def put_results(self, locs, names):
        with self._res_lock:
            self.face_locations, self.face_names = locs, names

    def get_results(self):
        with self._res_lock:
            return self.face_locations.copy(), list(self.face_names)

    def should_log(self, name: str) -> bool:
        now = time.time()
        with self._cd_lock:
            if now - self._last_logged.get(name, 0) >= COOLDOWN_SECONDS:
                self._last_logged[name] = now
                return True
        return False


S = _State()
_ENCODE_PARAMS = [cv2.IMWRITE_JPEG_QUALITY, STREAM_JPEG_QUALITY]


# ──────────────────────────────────────────────────────────────────────────────
#  Load face DB
# ──────────────────────────────────────────────────────────────────────────────
print("⌛ Loading face database…")
sfr = SimpleFacerec()
sfr.load_encoding_images(FACES_FOLDER)
print("✅ Face database ready.\n")


# ══════════════════════════════════════════════════════════════════════════════
#  THREAD 1 — CaptureThread  (producer)
# ══════════════════════════════════════════════════════════════════════════════

def capture_thread():
    # CAP_DSHOW = Windows DirectShow backend — 2-3× faster init than MSMF
    cap = cv2.VideoCapture(CAMERA_INDEX, cv2.CAP_DSHOW)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  CAMERA_WIDTH)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, CAMERA_HEIGHT)
    cap.set(cv2.CAP_PROP_FPS,          CAMERA_FPS)
    cap.set(cv2.CAP_PROP_BUFFERSIZE,   1)   # Smallest OS buffer

    if not cap.isOpened():
        raise RuntimeError(f"Cannot open camera {CAMERA_INDEX}")

    print(f"📷 Camera open: "
          f"{int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))}×"
          f"{int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))} "
          f"@ {int(cap.get(cv2.CAP_PROP_FPS))} FPS")

    t0, n = time.perf_counter(), 0
    while True:
        # flush driver's double-buffer → always get current frame
        cap.grab()
        cap.grab()
        ok, frame = cap.retrieve()

        if not ok or frame is None:
            time.sleep(0.005)
            continue

        S.put_raw(frame)

        # Bootstrap annotated slot before first AI result arrives
        if S.get_annotated() is None:
            S.put_annotated(frame.copy())

        n += 1
        t1 = time.perf_counter()
        if t1 - t0 >= 1.0:
            with S._fps_lock:
                S.fps_cap = round(n / (t1 - t0), 1)
            n, t0 = 0, t1


# ══════════════════════════════════════════════════════════════════════════════
#  THREAD 2 — AIThread  (consumer + producer)
# ══════════════════════════════════════════════════════════════════════════════

def ai_thread():
    t0, n = time.perf_counter(), 0
    while True:
        frame = S.get_raw()
        if frame is None:
            time.sleep(0.005)
            continue

        locs, names = sfr.detect_known_faces(frame)
        S.put_results(locs, names)
        S.put_annotated(_draw(frame, locs, names))

        for name in names:
            if name != "Unknown" and S.should_log(name):
                threading.Thread(target=_post, args=(name,), daemon=True).start()

        n += 1
        t1 = time.perf_counter()
        if t1 - t0 >= 1.0:
            with S._fps_lock:
                S.fps_ai = round(n / (t1 - t0), 1)
            n, t0 = 0, t1


# ──────────────────────────────────────────────────────────────────────────────
#  Drawing
# ──────────────────────────────────────────────────────────────────────────────

def _draw(frame: np.ndarray, locs: np.ndarray, names: list[str]) -> np.ndarray:
    out = frame.copy()
    for loc, name in zip(locs, names):
        y1, x2, y2, x1 = int(loc[0]), int(loc[1]), int(loc[2]), int(loc[3])
        col = (0, 210, 70) if name != "Unknown" else (20, 20, 220)
        cv2.rectangle(out, (x1, y1), (x2, y2), col, 2, cv2.LINE_AA)
        (tw, th), _ = cv2.getTextSize(name, cv2.FONT_HERSHEY_DUPLEX, 0.65, 1)
        cv2.rectangle(out, (x1, y1 - th - 14), (x1 + tw + 10, y1), col, cv2.FILLED)
        cv2.putText(out, name, (x1 + 5, y1 - 6),
                    cv2.FONT_HERSHEY_DUPLEX, 0.65, (255, 255, 255), 1, cv2.LINE_AA)

    with S._fps_lock:
        c, a, s = S.fps_cap, S.fps_ai, S.fps_str
    hud = (f" CAM {c} fps | AI {a} fps | "
           f"STREAM {s} fps | Faces: {len(names)} | {time.strftime('%H:%M:%S')} ")
    (hw, hh), _ = cv2.getTextSize(hud, cv2.FONT_HERSHEY_PLAIN, 1.05, 1)
    cv2.rectangle(out, (0, 0), (hw + 8, hh + 10), (0, 0, 0), cv2.FILLED)
    cv2.putText(out, hud, (4, hh + 4),
                cv2.FONT_HERSHEY_PLAIN, 1.05, (0, 255, 140), 1, cv2.LINE_AA)
    return out


# ──────────────────────────────────────────────────────────────────────────────
#  Attendance POST (fire-and-forget micro-thread)
# ──────────────────────────────────────────────────────────────────────────────

def _post(name: str):
    try:
        r = requests.post(NODE_API_URL, json={"barcode": name}, timeout=4)
        if r.status_code in (200, 201):
            d = r.json()
            print(f"📋 {d.get('status','?')} ← {d.get('name', name)}")
        else:
            print(f"⚠️  Node {r.status_code}: {r.text[:100]}")
    except Exception as e:
        print(f"❌ Node.js: {e}")


# ══════════════════════════════════════════════════════════════════════════════
#  THREAD 3 — Flask MJPEG StreamThread  (consumer)
# ══════════════════════════════════════════════════════════════════════════════

def _mjpeg():
    t0, n = time.perf_counter(), 0
    while True:
        frame = S.get_annotated()
        if frame is None:
            time.sleep(0.01)
            continue
        ok, buf = cv2.imencode(".jpg", frame, _ENCODE_PARAMS)
        if not ok:
            continue
        yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
               + buf.tobytes() + b"\r\n")
        n += 1
        t1 = time.perf_counter()
        if t1 - t0 >= 1.0:
            with S._fps_lock:
                S.fps_str = round(n / (t1 - t0), 1)
            n, t0 = 0, t1


# ══════════════════════════════════════════════════════════════════════════════
#  Flask app
# ══════════════════════════════════════════════════════════════════════════════

app = Flask(__name__)
CORS(app)


@app.route("/video_feed")
def video_feed():
    return Response(_mjpeg(),
                    mimetype="multipart/x-mixed-replace; boundary=frame")


@app.route("/status")
def status():
    locs, names = S.get_results()
    with S._fps_lock:
        c, a, s = S.fps_cap, S.fps_ai, S.fps_str
    return jsonify({
        "camera_fps":      c,
        "ai_fps":          a,
        "stream_fps":      s,
        "faces_visible":   len(names),
        "names_visible":   names,
        "db_size":         len(sfr.known_names),
        "inference_width": AI_INFERENCE_WIDTH,
    })


@app.route("/register", methods=["POST"])
def register():
    if "image" not in request.files or "name" not in request.form:
        return jsonify({"error": "Need 'image' (file) and 'name' (string)"}), 400
    arr   = np.frombuffer(request.files["image"].read(), np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if frame is None:
        return jsonify({"error": "Cannot decode image"}), 422
    ok = sfr.register_face(frame, request.form["name"].strip())
    return (jsonify({"message": "Registered."}), 201) if ok \
        else (jsonify({"error": "No face detected."}), 422)


# ══════════════════════════════════════════════════════════════════════════════
#  Entry point
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    threading.Thread(target=capture_thread, daemon=True, name="CaptureThread").start()
    threading.Thread(target=ai_thread,      daemon=True, name="AIThread").start()

    print(f"🚀  Stream  →  http://0.0.0.0:{PORT}/video_feed")
    print(f"📊  Metrics →  http://0.0.0.0:{PORT}/status\n")
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=PORT, threaded=True, debug=False)