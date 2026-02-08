import cv2
import requests
import threading
import time
from flask import Flask, Response
from flask_cors import CORS
from simple_facerec import SimpleFacerec

# --- CONFIGURATION ---
PORT = 5001
# Ensure this matches your Node.js route exactly!
NODE_API_URL = "http://localhost:5000/api/logs/attendance"
FACES_FOLDER = "faces/"
COOLDOWN_PERIOD = 10  # Seconds to wait before logging the same person again

app = Flask(__name__)
CORS(app)

# Initialize the recognition engine
sfr = SimpleFacerec()
print("⌛ Step 1: Loading face database from local folder...")
sfr.load_encoding_images(FACES_FOLDER)

# Global Variables for Threading
cap = cv2.VideoCapture(0)
current_frame = None
face_locations = []
face_names = []
last_logged_time = {} # Format: {"barcode": timestamp}

# --- BACKGROUND AI WORKER ---
def ai_worker():
    """ 
    This thread runs the heavy AI recognition in the background 
    so the video feed remains smooth (30 FPS).
    """
    global face_locations, face_names, current_frame
    
    while True:
        if current_frame is not None:
            # Process a copy of the frame
            img_to_process = current_frame.copy()
            
            # 1. Detect and Recognize
            locs, names = sfr.detect_known_faces(img_to_process)
            face_locations, face_names = locs, names

            # 2. Smart Attendance Logic
            for name in names:
                if name != "Unknown":
                    now = time.time()
                    
                    # Only send request to Node.js if cooldown has passed
                    if name not in last_logged_time or (now - last_logged_time[name]) > COOLDOWN_PERIOD:
                        try:
                            print(f"📡 Sending request for Barcode: {name}")
                            res = requests.post(
                                NODE_API_URL, 
                                json={"barcode": name},
                                timeout=3 # Increased timeout for slow DBs
                            )
                            
                            if res.status_code in [200, 201]:
                                data = res.json()
                                # status will be 'ENTRY' or 'EXIT' from our smart route
                                print(f"✅ {data.get('status')} recorded for {data.get('name', name)}")
                                last_logged_time[name] = now
                            else:
                                print(f"❌ Server Error {res.status_code}: {res.text}")
                                
                        except Exception as e:
                            print(f"❌ Failed to reach Node.js server: {e}")

        time.sleep(0.1) # Prevents CPU from hitting 100%

# Start the AI Thread
threading.Thread(target=ai_worker, daemon=True).start()

# --- VIDEO STREAMING LOGIC ---
def generate_frames():
    global current_frame, face_locations, face_names
    
    while True:
        success, frame = cap.read()
        if not success:
            break
        
        # Share the latest frame with the AI worker
        current_frame = frame

        # Draw UI (the boxes won't lag the video because they update from global variables)
        for face_loc, name in zip(face_locations, face_names):
            y1, x2, y2, x1 = face_loc
            
            # Color: Green if recognized, Red if unknown
            color = (0, 255, 0) if name != "Unknown" else (0, 0, 255)
            
            # Draw Box
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            
            # Draw Label Background
            cv2.rectangle(frame, (x1, y1 - 35), (x2, y1), color, cv2.FILLED)
            cv2.putText(frame, name, (x1 + 6, y1 - 6), cv2.FONT_HERSHEY_DUPLEX, 0.6, (255, 255, 255), 1)

        # Encode for Browser
        ret, buffer = cv2.imencode('.jpg', frame)
        if not ret:
            continue
            
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')

@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

if __name__ == "__main__":
    print(f"🚀 AI Video Server running at http://127.0.0.1:{PORT}")
    # debug=False is required when using multiple threads
    app.run(host='0.0.0.0', port=PORT, threaded=True, debug=False)