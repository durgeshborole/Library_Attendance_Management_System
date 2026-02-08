import face_recognition
import cv2
import os
import numpy as np
import pickle

class SimpleFacerec:
    def __init__(self):
        self.known_face_encodings = []
        self.known_face_names = []
        self.frame_resizing = 0.25 # Keep at 0.25 for max speed
        self.cache_file = "face_cache.pkl"

    def load_encoding_images(self, images_path):
        # 1. Instant Load if cache exists
        if os.path.exists(self.cache_file):
            print("🚀 Loading 'brain' from local cache...")
            with open(self.cache_file, 'rb') as f:
                data = pickle.load(f)
                self.known_face_encodings = data['encodings']
                self.known_face_names = data['names']
            print(f"✨ Loaded {len(self.known_face_names)} faces instantly.")
            return

        # 2. Scan folder if no cache
        print("📁 Scanning folder and encoding photos (One-time process)...")
        images_path = os.path.abspath(images_path)
        for img_path in os.listdir(images_path):
            input_path = os.path.join(images_path, img_path)
            try:
                img = cv2.imread(input_path)
                rgb_img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
                
                encodings = face_recognition.face_encodings(rgb_img)
                if len(encodings) > 0:
                    self.known_face_encodings.append(encodings[0])
                    # Store filename (without .jpg) as the name/barcode
                    self.known_face_names.append(os.path.splitext(img_path)[0])
                    print(f"✅ Encoded: {img_path}")
            except Exception as e:
                print(f"❌ Skip {img_path}: {e}")

        # 3. Save Cache
        with open(self.cache_file, 'wb') as f:
            pickle.dump({'encodings': self.known_face_encodings, 'names': self.known_face_names}, f)
        print("💾 Cache created for next time.")

    def detect_known_faces(self, frame):
        small_frame = cv2.resize(frame, (0, 0), fx=self.frame_resizing, fy=self.frame_resizing)
        rgb_small_frame = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)
        
        # 'hog' is much faster than 'cnn' on laptops
        face_locations = face_recognition.face_locations(rgb_small_frame, model="hog")
        face_encodings = face_recognition.face_encodings(rgb_small_frame, face_locations)

        face_names = []
        for face_encoding in face_encodings:
            matches = face_recognition.compare_faces(self.known_face_encodings, face_encoding, tolerance=0.5)
            name = "Unknown"
            
            face_distances = face_recognition.face_distance(self.known_face_encodings, face_encoding)
            if len(face_distances) > 0:
                best_match_index = np.argmin(face_distances)
                if matches[best_match_index]:
                    name = self.known_face_names[best_match_index]
            face_names.append(name)

        return (np.array(face_locations) / self.frame_resizing).astype(int), face_names