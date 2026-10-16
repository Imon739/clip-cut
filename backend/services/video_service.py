import cv2
import numpy as np
import os
import uuid
import logging
from io import BytesIO
from PIL import Image
from typing import Optional, Dict

logger = logging.getLogger(__name__)

# In-memory registry of uploaded videos
_video_registry: Dict[str, dict] = {}


def save_uploaded_video(file_content: bytes, filename: str, upload_dir: str) -> dict:
    """Save an uploaded video file and extract its metadata."""
    os.makedirs(upload_dir, exist_ok=True)
    
    video_id = str(uuid.uuid4())
    safe_filename = f"{video_id}_{filename}"
    filepath = os.path.join(upload_dir, safe_filename)
    
    with open(filepath, 'wb') as f:
        f.write(file_content)
    
    # Extract metadata using OpenCV
    info = get_video_info(filepath)
    if info is None:
        os.remove(filepath)
        raise ValueError(f"Could not read video file: {filename}")
    
    info['id'] = video_id
    info['filename'] = filename
    info['filepath'] = filepath
    info['stream_url'] = f"/api/videos/{video_id}/stream"
    
    _video_registry[video_id] = info
    logger.info(f"Saved video {filename} as {video_id}: {info['width']}x{info['height']} @ {info['fps']} FPS, {info['total_frames']} frames")
    
    return info


def get_video_info(video_path: str) -> Optional[dict]:
    """Extract video metadata using OpenCV."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return None
    
    try:
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fourcc = int(cap.get(cv2.CAP_PROP_FOURCC))
        codec = "".join([chr((fourcc >> 8 * i) & 0xFF) for i in range(4)])
        
        duration = total_frames / fps if fps > 0 else 0
        
        return {
            'width': width,
            'height': height,
            'fps': round(fps, 2),
            'total_frames': total_frames,
            'duration': round(duration, 4),
            'codec': codec.strip() or 'unknown',
        }
    finally:
        cap.release()


def get_frame(video_path: str, frame_number: int, as_thumbnail: bool = False, thumb_width: int = 320) -> Optional[np.ndarray]:
    """Extract a single frame using frame-accurate seeking."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return None
    
    try:
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if frame_number < 0 or frame_number >= total:
            return None
        
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
        ret, frame = cap.read()
        
        if not ret or frame is None:
            return None
        
        # Convert BGR to RGB
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        if as_thumbnail:
            h, w = frame_rgb.shape[:2]
            thumb_height = int(h * (thumb_width / w))
            frame_rgb = cv2.resize(frame_rgb, (thumb_width, thumb_height), interpolation=cv2.INTER_AREA)
        
        return frame_rgb
    finally:
        cap.release()


def frame_to_jpeg_bytes(frame: np.ndarray, quality: int = 90) -> bytes:
    """Convert a frame (RGB numpy array) to JPEG bytes."""
    img = Image.fromarray(frame)
    buffer = BytesIO()
    img.save(buffer, format='JPEG', quality=quality)
    return buffer.getvalue()


def frame_to_png_bytes(frame: np.ndarray) -> bytes:
    """Convert a frame (RGB numpy array) to PNG bytes."""
    img = Image.fromarray(frame)
    buffer = BytesIO()
    img.save(buffer, format='PNG')
    return buffer.getvalue()


def frame_to_bytes(frame: np.ndarray, format: str = 'jpg', quality: int = 90) -> bytes:
    """Convert a frame to the specified format bytes."""
    if format in ('jpg', 'jpeg'):
        return frame_to_jpeg_bytes(frame, quality)
    else:
        return frame_to_png_bytes(frame)


def save_frame_to_file(frame: np.ndarray, output_path: str, format: str = 'png') -> str:
    """Save a frame as an image file."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    img = Image.fromarray(frame)
    img.save(output_path)
    return output_path


def get_frame_timestamp(frame_number: int, fps: float) -> float:
    """Calculate the timestamp (in seconds) for a given frame number."""
    if fps <= 0:
        return 0.0
    return round(frame_number / fps, 6)


def get_registered_video(video_id: str) -> Optional[dict]:
    """Get a video from the in-memory registry."""
    video = _video_registry.get(video_id)
    if video and 'stream_url' not in video:
        video['stream_url'] = f"/api/videos/{video_id}/stream"
    return video


def get_all_videos() -> list:
    """Get all registered videos."""
    videos = list(_video_registry.values())
    for v in videos:
        if 'stream_url' not in v and 'id' in v:
            v['stream_url'] = f"/api/videos/{v['id']}/stream"
    return videos
