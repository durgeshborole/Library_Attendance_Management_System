# import cv2
# import os
# import numpy as np
# import pickle
# from mtcnn import MTCNN
# from keras_facenet import FaceNet

# class SimpleFacerec:
#     def __init__(self):
#         self.detector = MTCNN()
#         self.embedder = FaceNet()
#         self.known_face_encodings = []
#         self.known_face_names = []
#         self.cache_file = "face_cache.pkl"
#         self.frame_resizing = 1.0 # High res for distance

#     def load_encoding_images(self, images_path):
#         if os.path.exists(self.cache_file):
#             with open(self.cache_file, 'rb') as f:
#                 data = pickle.load(f)
#                 self.known_face_encodings = data['encodings']
#                 self.known_face_names = data['names']
#             return

#         for img_name in os.listdir(images_path):
#             img = cv2.imread(os.path.join(images_path, img_name))
#             img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            
#             # Use MTCNN to find the face in the photo
#             results = self.detector.detect_faces(img_rgb)
#             if results:
#                 x, y, w, h = results[0]['box']
#                 face_crop = img_rgb[y:y+h, x:x+w]
#                 # FaceNet creates the embedding
#                 encoding = self.embedder.embeddings([face_crop])[0]
#                 self.known_face_encodings.append(encoding)
#                 self.known_face_names.append(os.path.splitext(img_name)[0])

#         with open(self.cache_file, 'wb') as f:
#             pickle.dump({'encodings': self.known_face_encodings, 'names': self.known_face_names}, f)

#     def detect_known_faces(self, frame):
#         img_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
#         results = self.detector.detect_faces(img_rgb)
        
#         face_locations = []
#         face_names = []

#         if results:
#             for res in results:
#                 x, y, w, h = res['box']
                
#                 # REORDERED: face_recognition expects (top, right, bottom, left)
#                 # This ensures the boxes appear in the correct place on screen
#                 face_loc = (y, x + w, y + h, x)
                
#                 face_crop = img_rgb[y:y+h, x:x+w]
                
#                 if face_crop.size > 0:
#                     # FaceNet produces a (1, 512) array, we need it as (512,)
#                     encoding = self.embedder.embeddings([face_crop])[0]
                    
#                     # Ensure known_face_encodings is a numpy array for broadcasting
#                     known_encodings_array = np.array(self.known_face_encodings)
                    
#                     if len(known_encodings_array) > 0:
#                         # Calculate Euclidean distance
#                         distances = np.linalg.norm(known_encodings_array - encoding, axis=1)
#                         min_dist_idx = np.argmin(distances)
                        
#                         # FaceNet distance threshold is typically 0.7
#                         if distances[min_dist_idx] < 0.7:
#                             name = self.known_face_names[min_dist_idx]
#                         else:
#                             name = "Unknown"
#                     else:
#                         name = "Unknown"
                        
#                     face_locations.append(face_loc)
#                     face_names.append(name)
                        
#         return np.array(face_locations), face_names




# import cv2
# import os
# import numpy as np
# import pickle
# import mediapipe as mp
# from keras_facenet import FaceNet

# class SimpleFacerec:
#     def __init__(self):
#         # 1. Mediapipe for ultra-fast detection and movement tracking
#         self.mp_face_detection = mp.solutions.face_detection
#         self.detector = self.mp_face_detection.FaceDetection(
#             model_selection=0, # 0 = fast tracking (within 2m), 1 = better distance (5m)
#             min_detection_confidence=0.5
#         )
        
#         # 2. FaceNet for high-accuracy 512-d embeddings
#         self.embedder = FaceNet()
        
#         self.known_face_encodings = []
#         self.known_face_names = []
#         self.cache_file = "face_cache.pkl"

#     def load_encoding_images(self, images_path):
#         if os.path.exists(self.cache_file):
#             print("🚀 Loading FaceNet embeddings from cache...")
#             with open(self.cache_file, 'rb') as f:
#                 data = pickle.load(f)
#                 self.known_face_encodings = data['encodings']
#                 self.known_face_names = data['names']
#             return

#         print("📁 Scanning folder (Generating 512-d FaceNet embeddings)...")
#         for img_name in os.listdir(images_path):
#             img = cv2.imread(os.path.join(images_path, img_name))
#             if img is None: continue
            
#             img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
#             # Use FaceNet to get the embedding directly from the image
#             detections = self.embedder.extract(img_rgb, threshold=0.95)
#             if detections:
#                 encoding = detections[0]['embedding']
#                 self.known_face_encodings.append(encoding)
#                 self.known_face_names.append(os.path.splitext(img_name)[0])
#                 print(f"✅ Registered: {img_name}")

#         with open(self.cache_file, 'wb') as f:
#             pickle.dump({'encodings': self.known_face_encodings, 'names': self.known_face_names}, f)

#     def detect_known_faces(self, frame):
#         h, w, _ = frame.shape
#         img_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
#         # Fast detection step
#         results = self.detector.process(img_rgb)
        
#         face_locations = []
#         face_names = []

#         if results.detections:
#             for detection in results.detections:
#                 bboxC = detection.location_data.relative_bounding_box
                
#                 # Convert relative to pixel coordinates
#                 x, y, bw, bh = int(bboxC.xmin * w), int(bboxC.ymin * h), int(bboxC.width * w), int(bboxC.height * h)
                
#                 # Boundary clamping to prevent the Conv2D error
#                 x, y = max(0, x), max(0, y)
#                 right, bottom = min(w, x + bw), min(h, y + bh)
                
#                 face_loc = (y, right, bottom, x) # (top, right, bottom, left)
#                 face_crop = img_rgb[y:bottom, x:right]
                
#                 if face_crop.size > 0:
#                     # Get 512-d encoding for the moving face
#                     encoding = self.embedder.embeddings([face_crop])[0]
                    
#                     known_encs = np.array(self.known_face_encodings)
#                     if len(known_encs) > 0:
#                         # Euclidean distance
#                         distances = np.linalg.norm(known_encs - encoding, axis=1)
#                         min_idx = np.argmin(distances)
                        
#                         # FaceNet threshold (0.7 is standard)
#                         if distances[min_idx] < 0.7:
#                             name = self.known_face_names[min_idx]
#                         else:
#                             name = "Unknown"
                        
#                         face_locations.append(face_loc)
#                         face_names.append(name)
                        
#         return np.array(face_locations), face_names



import cv2
import os
import numpy as np
import pickle
import mediapipe as mp
from keras_facenet import FaceNet

class SimpleFacerec:
    def __init__(self):
        # 1. Mediapipe (The Speed King)
        self.mp_face_detection = mp.solutions.face_detection
        self.detector = self.mp_face_detection.FaceDetection(
            model_selection=0, # 0 = Short range (fastest for < 2m)
            min_detection_confidence=0.6 # Higher = fewer false/slow boxes
        )
        
        # 2. FaceNet (The Brain)
        self.embedder = FaceNet()
        
        self.known_face_encodings = []
        self.known_face_names = []
        self.cache_file = "face_cache.pkl"

    def load_encoding_images(self, images_path):
        if os.path.exists(self.cache_file):
            with open(self.cache_file, 'rb') as f:
                data = pickle.load(f)
                self.known_face_encodings = data['encodings']
                self.known_face_names = data['names']
            return

        print("📁 Scanning folder (Generating 512-d FaceNet embeddings)...")
        for img_name in os.listdir(images_path):
             img = cv2.imread(os.path.join(images_path, img_name))
             if img is None: continue
           
             img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
             # Use FaceNet to get the embedding directly from the image
             detections = self.embedder.extract(img_rgb, threshold=0.95)
             if detections:
                 encoding = detections[0]['embedding']
                 self.known_face_encodings.append(encoding)
                 self.known_face_names.append(os.path.splitext(img_name)[0])
                 print(f"✅ Registered: {img_name}")

        with open(self.cache_file, 'wb') as f:
             pickle.dump({'encodings': self.known_face_encodings, 'names': self.known_face_names}, f)

    def detect_known_faces(self, frame):
        h, w, _ = frame.shape
        img_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # Fast detection
        results = self.detector.process(img_rgb)
        
        face_locations = []
        face_names = []

        if results.detections:
            for detection in results.detections:
                bboxC = detection.location_data.relative_bounding_box
                
                # Expand the box slightly to help FaceNet see the whole head
                x = int(bboxC.xmin * w)
                y = int(bboxC.ymin * h)
                bw = int(bboxC.width * w)
                bh = int(bboxC.height * h)
                
                # Clamping
                x, y = max(0, x), max(0, y)
                right, bottom = min(w, x + bw), min(h, y + bh)
                
                face_loc = (y, right, bottom, x)
                face_crop = img_rgb[y:bottom, x:right]
                
                # Only run recognition if the face is large enough (prevents distant lag)
                if face_crop.size > 1000: 
                    # Get 512-d encoding
                    encoding = self.embedder.embeddings([face_crop])[0]
                    
                    known_encs = np.array(self.known_face_encodings)
                    if len(known_encs) > 0:
                        distances = np.linalg.norm(known_encs - encoding, axis=1)
                        min_idx = np.argmin(distances)
                        
                        # FaceNet is stricter; 0.7 is a solid match
                        if distances[min_idx] < 0.7:
                            name = self.known_face_names[min_idx]
                        else:
                            name = "Unknown"
                        
                        face_locations.append(face_loc)
                        face_names.append(name)
                        
        return np.array(face_locations), face_names