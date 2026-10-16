import os
import uuid
import logging
from typing import Optional, Dict

from backend.utils.ffmpeg_utils import extract_clip as ffmpeg_extract_clip, verify_clip

logger = logging.getLogger(__name__)

# In-memory clip registry
_clip_registry: Dict[str, dict] = {}


def extract_clip(
    video_info: dict,
    start_frame: int,
    end_frame: int,
    context_before: int = 0,
    context_after: int = 0,
    output_dir: str = './dataset'
) -> dict:
    """
    Extract a clip from a video using frame-accurate re-encoding.
    
    The offset frame is INCLUSIVE: both start_frame and end_frame appear in output.
    
    Args:
        video_info: dict with filepath, fps, total_frames, filename
        start_frame: onset frame number
        end_frame: offset frame number (inclusive)
        context_before: extra frames to include before onset
        context_after: extra frames to include after offset
        output_dir: directory to save the clip
    
    Returns:
        ClipInfo dict
    """
    total_frames = video_info['total_frames']
    fps = video_info['fps']
    
    # Apply context frames with clamping
    actual_start = max(0, start_frame - context_before)
    actual_end = min(total_frames - 1, end_frame + context_after)
    
    includes_context = context_before > 0 or context_after > 0
    actual_context_before = start_frame - actual_start
    actual_context_after = actual_end - end_frame
    
    # Generate clip ID and output path
    clip_id = str(uuid.uuid4())
    clip_filename = f"clip_{clip_id[:8]}_f{actual_start}-f{actual_end}.mp4"
    
    clips_dir = os.path.join(output_dir, 'clips')
    os.makedirs(clips_dir, exist_ok=True)
    output_path = os.path.join(clips_dir, clip_filename)
    
    # Extract using FFmpeg if available, or fall back to OpenCV VideoWriter
    from backend.utils.ffmpeg_utils import check_ffmpeg_available
    result = None
    extraction_note = 'h264 crf=10 (visually lossless re-encode for frame accuracy)'
    
    if check_ffmpeg_available():
        try:
            result = ffmpeg_extract_clip(
                input_path=video_info['filepath'],
                output_path=output_path,
                start_frame=actual_start,
                end_frame=actual_end,
                fps=fps
            )
        except Exception as e:
            logger.warning(f"FFmpeg extraction failed ({e}), falling back to OpenCV VideoWriter")
            result = None

    if not result or not result.get('success'):
        result = _extract_clip_opencv(
            input_path=video_info['filepath'],
            output_path=output_path,
            start_frame=actual_start,
            end_frame=actual_end,
            fps=fps
        )
        extraction_note = 'mp4v (OpenCV fallback - install FFmpeg for H.264 CRF=10)'
    
    if not result.get('success'):
        raise RuntimeError(
            f"Clip extraction failed: {result.get('error', 'Unknown error')}"
        )
    
    expected_frames = actual_end - actual_start + 1  # inclusive
    
    clip_info = {
        'clip_id': clip_id,
        'source_video': video_info.get('filename', ''),
        'source_video_id': video_info.get('id', ''),
        'start_frame': actual_start,
        'end_frame': actual_end,
        'frame_count': result.get('actual_frames', expected_frames),
        'duration': result.get('duration', expected_frames / fps),
        'fps': result.get('fps', fps),
        'filepath': output_path,
        'filename': clip_filename,
        'includes_context': includes_context,
        'context_before': actual_context_before,
        'context_after': actual_context_after,
        'offset_inclusive': True,
        'encoding_note': extraction_note,
        'extraction_method': result.get('method', 'unknown'),
        'expected_frames': expected_frames,
    }
    
    _clip_registry[clip_id] = clip_info
    logger.info(
        f"Extracted clip {clip_id}: frames {actual_start}-{actual_end}, "
        f"{result.get('actual_frames', '?')} frames, {result.get('duration', '?')}s"
    )
    
    return clip_info


def _extract_clip_opencv(input_path: str, output_path: str, start_frame: int, end_frame: int, fps: float) -> dict:
    """Frame-accurate clip extraction fallback using OpenCV VideoWriter."""
    import cv2
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        return {'success': False, 'error': f'Could not open video file: {input_path}'}
    
    try:
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        expected_frames = end_frame - start_frame + 1
        
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        # Try mp4v fourcc which is standard and universally supported in OpenCV
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
        
        cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
        frames_written = 0
        for _ in range(expected_frames):
            ret, frame = cap.read()
            if not ret or frame is None:
                break
            out.write(frame)
            frames_written += 1
            
        out.release()
        duration = frames_written / fps if fps > 0 else 0
        return {
            'success': True,
            'output_path': output_path,
            'expected_frames': expected_frames,
            'actual_frames': frames_written,
            'duration': round(duration, 4),
            'fps': fps,
            'method': 'opencv_videowriter'
        }
    finally:
        cap.release()


def get_clip(clip_id: str) -> Optional[dict]:
    """Get clip info from registry."""
    return _clip_registry.get(clip_id)


def get_clip_path(clip_id: str) -> Optional[str]:
    """Get the file path of a clip."""
    clip = _clip_registry.get(clip_id)
    if clip:
        return clip.get('filepath')
    return None
