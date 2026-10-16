from fastapi import APIRouter, HTTPException
import os
import logging

from backend.models.schemas import CropRequest, PresetRequest
from backend.services.video_service import get_registered_video, get_frame, save_frame_to_file
from backend.services.face_service import detect_face, get_region_preset
from backend.services.crop_service import crop_frame, save_crop, validate_and_adjust_crop

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/crop", tags=["cropping"])


@router.post("/detect/{video_id}/{frame_number}")
async def detect_face_in_frame(video_id: str, frame_number: int):
    """Auto-detect face bounding box in a specific frame."""
    video = get_registered_video(video_id)
    if not video:
        raise HTTPException(status_code=404, detail=f"Video not found: {video_id}")
    
    if frame_number < 0 or frame_number >= video['total_frames']:
        raise HTTPException(
            status_code=400,
            detail=f"Frame {frame_number} out of range [0, {video['total_frames'] - 1}]"
        )
    
    frame = get_frame(video['filepath'], frame_number)
    if frame is None:
        raise HTTPException(status_code=500, detail=f"Could not extract frame {frame_number}")
    
    result = detect_face(frame)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail="No face detected in this frame. Try a different frame or use manual cropping."
        )
    
    return result


@router.post("/preset/{video_id}/{frame_number}")
async def get_preset_region(video_id: str, frame_number: int, request: PresetRequest):
    """Get a preset face region (full_face, eyes, eyebrows, mouth)."""
    video = get_registered_video(video_id)
    if not video:
        raise HTTPException(status_code=404, detail=f"Video not found: {video_id}")
    
    if frame_number < 0 or frame_number >= video['total_frames']:
        raise HTTPException(
            status_code=400,
            detail=f"Frame {frame_number} out of range [0, {video['total_frames'] - 1}]"
        )
    
    frame = get_frame(video['filepath'], frame_number)
    if frame is None:
        raise HTTPException(status_code=500, detail=f"Could not extract frame {frame_number}")
    
    result = get_region_preset(frame, request.preset)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail=f"Could not detect {request.preset} region. Try a different frame or use manual cropping."
        )
    
    return result


@router.post("/apply")
async def apply_crop(request: CropRequest):
    """Apply crop to a frame and save both original and cropped images."""
    video = get_registered_video(request.video_id)
    if not video:
        raise HTTPException(status_code=404, detail=f"Video not found: {request.video_id}")
    
    if request.frame_number < 0 or request.frame_number >= video['total_frames']:
        raise HTTPException(
            status_code=400,
            detail=f"Frame {request.frame_number} out of range [0, {video['total_frames'] - 1}]"
        )
    
    frame = get_frame(video['filepath'], request.frame_number)
    if frame is None:
        raise HTTPException(status_code=500, detail=f"Could not extract frame {request.frame_number}")
    
    h, w = frame.shape[:2]
    
    # Validate and adjust crop bounds
    x, y, cw, ch = validate_and_adjust_crop(
        request.x, request.y, request.width, request.height, w, h
    )
    
    # Crop the frame
    cropped = crop_frame(frame, x, y, cw, ch)
    
    # Save paths
    base_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        'dataset',
        request.participant_id,
        request.video_label
    )
    
    ext = 'jpg' if request.format in ('jpg', 'jpeg') else 'png'
    
    # Save original frame
    original_dir = os.path.join(base_dir, 'original_frames')
    original_path = os.path.join(original_dir, f"frame_{request.frame_number:06d}.{ext}")
    save_frame_to_file(frame, original_path, request.format)
    
    # Save cropped frame
    cropped_dir = os.path.join(base_dir, 'cropped_frames')
    cropped_path = os.path.join(cropped_dir, f"frame_{request.frame_number:06d}_cropped.{ext}")
    save_crop(cropped, cropped_path, request.format)
    
    return {
        'original_path': original_path,
        'cropped_path': cropped_path,
        'coordinates': {'x': x, 'y': y, 'width': cw, 'height': ch},
        'preset_used': request.preset,
    }
