import cv2
import requests
import os
import base64
import time
from simple_facerec import SimpleFacerec

# 1. Sync images from Database
def sync_images_from_db():
    print("Syncing images from database...")
    if not os.path.exists("images"):
        os.makedirs("images")
        
    try:
        response = requests.get('http://localhost:5000/api/sync-images')
        students = response.json()
        
        for student in students:
            barcode = student['barcode']
            photo_data = student['photo'] # Assuming this is Base64 string
            
            # Save Base64 to local .jpg file named as the barcode
            with open(f"images/{barcode}.jpg", "wb") as fh:
                fh.write(base64.b64decode(photo_data.split(",")[1])) # Strip header if exists
        print("Sync complete.")
    except Exception as e:
        print(f"Sync failed: {e}")

# Run sync before starting recognition
sync_images_from_db()

# 2. Start Recognition
sfr = SimpleFacerec()
sfr.load_encoding_images("images/")
cap = cv2.VideoCapture(0)

last_log_time = {}

while True:
    ret, frame = cap.read()
    face_locations, face_names = sfr.detect_known_faces(frame)

    for face_loc, name in zip(face_locations, face_names):
        if name != "Unknown":
            # Prevent rapid-fire logging (10-second cooldown)
            current_time = time.time()
            if name not in last_log_time or (current_time - last_log_time[name] > 10):
                # INDIVIDUAL LOGIC: Send identified name (barcode) to your server
                requests.post('http://localhost:5000/api/logs/entry', json={'barcode': name})
                last_log_time[name] = current_time
                print(f"Face Recognized & Logged: {name}")

    cv2.imshow("Face Recognition System", frame)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()