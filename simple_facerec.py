import os
import pickle
import numpy as np
import cv2
 
# InsightFace – unified detection + ArcFace recognition
import insightface
from insightface.app import FaceAnalysis
 
# FAISS – Facebook's fast approximate nearest-neighbour library
import faiss
 
 
# ──────────────────────────────────────────────────────────────────────────────
# Tunable constants
# ──────────────────────────────────────────────────────────────────────────────
CACHE_FILE        = "face_cache.pkl"
 
 
class _StaleCache(Exception):
    """Raised internally when the on-disk cache is from an incompatible model."""
 
 
COSINE_THRESHOLD  = 0.40   # ArcFace cosine similarity: ≥ 0.40 → recognised
INFERENCE_SIZE    = 320    # Resize frame to this width before running inference
                            # (faster); set to None to use full resolution.
 
 
class SimpleFacerec:
    """
    High-performance face recogniser.
 
    Usage
    -----
    sfr = SimpleFacerec()
    sfr.load_encoding_images("faces/")
 
    # In your video loop:
    face_locations, face_names = sfr.detect_known_faces(bgr_frame)
    """
 
    def __init__(self):
        print("⚙️  Initialising InsightFace (buffalo_sc)…")
        # buffalo_sc = small+fast; swap for "buffalo_l" for maximum accuracy
        self.app = FaceAnalysis(
            name="buffalo_sc",
            providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
        )
        # det_size must be a multiple of 32; 320 is the sweet spot for speed
        self.app.prepare(ctx_id=0, det_size=(320, 320))
 
        # These are populated by load_encoding_images()
        self.known_names:     list[str]       = []
        self.faiss_index:     faiss.IndexFlatIP | None = None
        self._embedding_dim:  int             = 512   # ArcFace default
 
    # ──────────────────────────────────────────────────────────────────────
    # Public: load & cache face database
    # ──────────────────────────────────────────────────────────────────────
 
    def load_encoding_images(self, images_path: str) -> None:
        """
        Build (or reload from cache) the FAISS index from images in *images_path*.
        File names (without extension) are used as identities.
        """
        if os.path.exists(CACHE_FILE):
            try:
                self._load_cache()
                return          # Cache was valid — done
            except _StaleCache:
                pass            # Old format deleted; fall through to full rebuild
 
        print(f"📁 Scanning '{images_path}' — generating ArcFace embeddings…")
        encodings: list[np.ndarray] = []
        names:     list[str]        = []
 
        for fname in sorted(os.listdir(images_path)):
            fpath = os.path.join(images_path, fname)
            img   = cv2.imread(fpath)
            if img is None:
                print(f"  ⚠️  Skipped (unreadable): {fname}")
                continue
 
            faces = self.app.get(img)
            if not faces:
                print(f"  ⚠️  No face detected in: {fname}")
                continue
 
            # Use the largest detected face (most likely the subject)
            face = max(faces, key=lambda f: _bbox_area(f.bbox))
            emb  = self._normalise(face.embedding)
 
            encodings.append(emb)
            identity = os.path.splitext(fname)[0]
            names.append(identity)
            print(f"  ✅ Registered: {identity}")
 
        if not encodings:
            raise RuntimeError("No valid face images found — cannot build index.")
 
        self.known_names = names
        self._build_faiss_index(np.vstack(encodings))
        self._save_cache()
        print(f"\n🗂️  Index built: {len(names)} identities stored.")
 
    # ──────────────────────────────────────────────────────────────────────
    # Public: detect + recognise in one call
    # ──────────────────────────────────────────────────────────────────────
 
    def detect_known_faces(
        self, frame: np.ndarray
    ) -> tuple[np.ndarray, list[str]]:
        """
        Parameters
        ----------
        frame : BGR uint8 ndarray (full-resolution camera frame)
 
        Returns
        -------
        face_locations : ndarray of shape (N, 4) — rows are (y1, x2, y2, x1)
                         matching the original frame's coordinate space.
        face_names     : list of N strings ("Unknown" when unrecognised)
        """
        if self.faiss_index is None or self.faiss_index.ntotal == 0:
            return np.empty((0, 4), dtype=int), []
 
        # ── Optional: shrink frame for faster inference ──────────────────
        orig_h, orig_w = frame.shape[:2]
        if INFERENCE_SIZE and orig_w > INFERENCE_SIZE:
            scale  = INFERENCE_SIZE / orig_w
            small  = cv2.resize(frame, None, fx=scale, fy=scale,
                                interpolation=cv2.INTER_LINEAR)
        else:
            scale  = 1.0
            small  = frame
 
        faces = self.app.get(small)
 
        face_locations: list[tuple[int, int, int, int]] = []
        face_names:     list[str]                        = []
 
        for face in faces:
            # ── Scale bbox back to original resolution ───────────────────
            x1, y1, x2, y2 = (face.bbox / scale).astype(int)
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(orig_w, x2), min(orig_h, y2)
 
            # (y1, x2, y2, x1) — keeps backward compatibility with original
            face_locations.append((y1, x2, y2, x1))
 
            # ── FAISS cosine search ──────────────────────────────────────
            emb = self._normalise(face.embedding).reshape(1, -1)
            similarities, indices = self.faiss_index.search(emb, k=1)
 
            sim = float(similarities[0][0])
            idx = int(indices[0][0])
 
            name = self.known_names[idx] if sim >= COSINE_THRESHOLD else "Unknown"
            face_names.append(name)
 
        return np.array(face_locations, dtype=int), face_names
 
    # ──────────────────────────────────────────────────────────────────────
    # Public utility: add a new face at runtime (no restart needed)
    # ──────────────────────────────────────────────────────────────────────
 
    def register_face(self, bgr_image: np.ndarray, identity: str) -> bool:
        """
        Encode *bgr_image* and add it to the live index.
        Returns True on success, False if no face was detected.
        """
        faces = self.app.get(bgr_image)
        if not faces:
            return False
 
        face = max(faces, key=lambda f: _bbox_area(f.bbox))
        emb  = self._normalise(face.embedding).reshape(1, -1)
 
        if self.faiss_index is None:
            self._build_faiss_index(emb)
        else:
            self.faiss_index.add(emb)
 
        self.known_names.append(identity)
        self._save_cache()
        print(f"✅ Registered new face at runtime: {identity}")
        return True
 
    # ──────────────────────────────────────────────────────────────────────
    # Private helpers
    # ──────────────────────────────────────────────────────────────────────
 
    @staticmethod
    def _normalise(vec: np.ndarray) -> np.ndarray:
        """L2-normalise so inner-product == cosine similarity."""
        vec = vec.astype(np.float32)
        norm = np.linalg.norm(vec)
        return vec / (norm + 1e-8)
 
    def _build_faiss_index(self, matrix: np.ndarray) -> None:
        """Create a FAISS flat index for inner-product (cosine) search."""
        dim = matrix.shape[1]
        self._embedding_dim = dim
        index = faiss.IndexFlatIP(dim)   # IP = inner product
        index.add(matrix.astype(np.float32))
        self.faiss_index = index
 
    def _save_cache(self) -> None:
        payload = {
            "names":     self.known_names,
            "embeddings": self._index_to_matrix(),
        }
        with open(CACHE_FILE, "wb") as f:
            pickle.dump(payload, f)
        print(f"💾 Cache saved → {CACHE_FILE}")
 
    def _load_cache(self) -> None:
        with open(CACHE_FILE, "rb") as f:
            data = pickle.load(f)
 
        self.known_names = data["names"]
 
        # Accept both new key ("embeddings") and legacy v1 key ("encodings").
        # If it's the old FaceNet cache the vectors are 512-d but were produced
        # by a different model, so we delete it and rebuild from scratch.
        if "embeddings" in data:
            embeddings = data["embeddings"].astype(np.float32)
            self._build_faiss_index(embeddings)
            print(f"⚡ Cache loaded → {len(self.known_names)} identities, FAISS ready.")
        else:
            # Old FaceNet cache — incompatible with ArcFace, must regenerate
            print("⚠️  Old cache format detected (FaceNet). Deleting and rebuilding…")
            os.remove(CACHE_FILE)
            self.known_names = []
            raise _StaleCache
 
    def _index_to_matrix(self) -> np.ndarray:
        """Extract raw vectors from the FAISS index for serialisation."""
        n   = self.faiss_index.ntotal
        dim = self._embedding_dim
        out = np.empty((n, dim), dtype=np.float32)
        self.faiss_index.reconstruct_n(0, n, out)
        return out
 
 
# ──────────────────────────────────────────────────────────────────────────────
# Module-level helpers
# ──────────────────────────────────────────────────────────────────────────────
 
def _bbox_area(bbox: np.ndarray) -> float:
    x1, y1, x2, y2 = bbox
    return max(0.0, x2 - x1) * max(0.0, y2 - y1)
 