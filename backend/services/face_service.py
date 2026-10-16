import numpy as np
import logging
from typing import Optional, Dict

logger = logging.getLogger(__name__)

# Lazy-load MediaPipe to avoid import errors if not installed
_face_detection = None
_face_mesh = None
_mp = None


def _init_mediapipe():
    """Initialize MediaPipe models lazily."""
    global _face_detection, _face_mesh, _mp
    if _mp is not None:
        return
    try:
        import mediapipe as mp
        _mp = mp
        _face_detection = mp.solutions.face_detection.FaceDetection(
            model_selection=1,  # Full range model
            min_detection_confidence=0.5
        )
        _face_mesh = mp.solutions.face_mesh.FaceMesh(
            static_image_mode=True,
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5
        )
        logger.info("MediaPipe initialized successfully")
    except ImportError:
        logger.warning("MediaPipe not installed. Face detection will be unavailable.")
    except Exception as e:
        logger.error(f"Failed to initialize MediaPipe: {e}")


def detect_face(image: np.ndarray) -> Optional[Dict]:
    """
    Detect a face in the image and return bounding box.
    
    Args:
        image: RGB numpy array
    
    Returns:
        Dict with x, y, width, height, confidence or None if no face found
    """
    _init_mediapipe()
    if _face_detection is None:
        return None
    
    h, w = image.shape[:2]
    results = _face_detection.process(image)
    
    if not results.detections:
        return None
    
    detection = results.detections[0]
    bbox = detection.location_data.relative_bounding_box
    
    x = max(0, int(bbox.xmin * w))
    y = max(0, int(bbox.ymin * h))
    bw = min(int(bbox.width * w), w - x)
    bh = min(int(bbox.height * h), h - y)
    
    return {
        'x': x,
        'y': y,
        'width': bw,
        'height': bh,
        'confidence': round(detection.score[0], 4) if detection.score else 0.0
    }


def detect_landmarks(image: np.ndarray) -> Optional[Dict]:
    """
    Detect face landmarks using Face Mesh.
    
    Returns dict with landmark groups for different face regions.
    """
    _init_mediapipe()
    if _face_mesh is None:
        return None
    
    h, w = image.shape[:2]
    results = _face_mesh.process(image)
    
    if not results.multi_face_landmarks:
        return None
    
    face_landmarks = results.multi_face_landmarks[0]
    
    # Convert landmarks to pixel coordinates
    landmarks = []
    for lm in face_landmarks.landmark:
        landmarks.append({
            'x': int(lm.x * w),
            'y': int(lm.y * h),
            'z': lm.z
        })
    
    return {
        'all': landmarks,
        'count': len(landmarks),
    }


# MediaPipe Face Mesh landmark indices for different regions
_LANDMARK_REGIONS = {
    'full_face': {
        'indices': list(range(468)),  # All face landmarks
        'padding': 0.20,  # 20% padding
    },
    'eyes': {
        # Left eye: 33, 133, 160, 159, 158, 144, 145, 153
        # Right eye: 263, 362, 387, 386, 385, 373, 374, 380
        'indices': [33, 133, 160, 159, 158, 144, 145, 153, 263, 362, 387, 386, 385, 373, 374, 380,
                    # Extended eye area
                    7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246,
                    382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398],
        'padding': 0.25,
    },
    'eyebrows': {
        # Left eyebrow: 70, 63, 105, 66, 107
        # Right eyebrow: 336, 296, 334, 293, 300
        'indices': [70, 63, 105, 66, 107, 55, 65, 52, 53, 46,
                    336, 296, 334, 293, 300, 285, 295, 282, 283, 276],
        'padding': 0.30,
    },
    'mouth': {
        # Outer lips: 61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185
        'indices': [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185,
                    # Inner lips
                    78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191],
        'padding': 0.30,
    }
}


def get_region_preset(image: np.ndarray, preset_name: str) -> Optional[Dict]:
    """
    Get bounding box for a specific face region preset.
    
    Args:
        image: RGB numpy array
        preset_name: one of 'full_face', 'eyes', 'eyebrows', 'mouth'
    
    Returns:
        Dict with x, y, width, height or None
    """
    if preset_name not in _LANDMARK_REGIONS:
        return None
    
    landmarks_data = detect_landmarks(image)
    if landmarks_data is None:
        # Fallback to face detection for full_face
        if preset_name == 'full_face':
            face = detect_face(image)
            if face:
                # Add padding
                padding = 0.20
                h, w = image.shape[:2]
                pad_x = int(face['width'] * padding)
                pad_y = int(face['height'] * padding)
                return {
                    'x': max(0, face['x'] - pad_x),
                    'y': max(0, face['y'] - pad_y),
                    'width': min(face['width'] + 2 * pad_x, w - max(0, face['x'] - pad_x)),
                    'height': min(face['height'] + 2 * pad_y, h - max(0, face['y'] - pad_y)),
                }
        return None
    
    all_landmarks = landmarks_data['all']
    region = _LANDMARK_REGIONS[preset_name]
    h, w = image.shape[:2]
    
    # Get landmarks for this region
    region_indices = region['indices']
    region_landmarks = [all_landmarks[i] for i in region_indices if i < len(all_landmarks)]
    
    if not region_landmarks:
        return None
    
    # Calculate bounding box
    xs = [lm['x'] for lm in region_landmarks]
    ys = [lm['y'] for lm in region_landmarks]
    
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    
    # Add padding
    padding = region['padding']
    box_w = max_x - min_x
    box_h = max_y - min_y
    pad_x = int(box_w * padding)
    pad_y = int(box_h * padding)
    
    result_x = max(0, min_x - pad_x)
    result_y = max(0, min_y - pad_y)
    result_w = min(max_x + pad_x - result_x, w - result_x)
    result_h = min(max_y + pad_y - result_y, h - result_y)
    
    return {
        'x': result_x,
        'y': result_y,
        'width': result_w,
        'height': result_h,
    }


def cleanup():
    """Release MediaPipe resources."""
    global _face_detection, _face_mesh
    if _face_detection:
        _face_detection.close()
        _face_detection = None
    if _face_mesh:
        _face_mesh.close()
        _face_mesh = None
