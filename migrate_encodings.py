import requests
import face_recognition
import base64
import numpy as np
import cv2

# 1. Fetch all visitors from your DB
response = requests.get('http://localhost:5000/api/sync-images')
visitors = response.json()

print(f"🔄 Starting migration for {len(visitors)} visitors...")

for v in visitors:
    # Skip if they already have an encoding or no photo
    if v.get('faceEncoding') or not v.get('photo'):
        continue
    
    try:
        # Decode the photoUrl you already have in DB
        photo_data = v['photo']
        img_bytes = base64.b64decode(photo_data.split(",")[1] if "," in photo_data else photo_data)
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        rgb_img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

        # Generate the 128 numbers
        encoding = face_recognition.face_encodings(rgb_img)
        
        if len(encoding) > 0:
            # Convert to list and send back to Server
            encoding_list = encoding[0].tolist()
            requests.put(f"http://localhost:5000/api/sync-encoding/{v['barcode']}", 
                         json={"faceEncoding": encoding_list})
            print(f"✅ Auto-updated: {v['barcode']}")
        else:
            print(f"⚠️ No face found in photo for: {v['barcode']}")

    except Exception as e:
        print(f"❌ Error on {v['barcode']}: {e}")

print("✨ Migration Complete! All existing data is now optimized.")