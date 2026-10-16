from fastapi import APIRouter, HTTPException
import logging
from typing import Dict

from backend.models.schemas import AnnotationCreate, Annotation
from backend.services.video_service import get_registered_video, get_frame_timestamp

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/annotations", tags=["annotations"])

# In-memory annotation storage
_annotations: Dict[str, dict] = {}


@router.post("/{video_id}")
async def create_annotation(video_id: str, data: AnnotationCreate):
    """Save onset/apex/offset annotation for a video."""
    video = get_registered_video(video_id)
    if not video:
        raise HTTPException(status_code=404, detail=f"Video not found: {video_id}")
    
    total = video['total_frames']
    fps = video['fps']
    
    # Validate frame ranges
    for name, val in [('onset', data.onset_frame), ('apex', data.apex_frame), ('offset', data.offset_frame)]:
        if val < 0 or val >= total:
            raise HTTPException(
                status_code=400,
                detail=f"{name} frame {val} out of range [0, {total - 1}]"
            )
    
    annotation = {
        'video_id': video_id,
        'onset_frame': data.onset_frame,
        'apex_frame': data.apex_frame,
        'offset_frame': data.offset_frame,
        'onset_time': get_frame_timestamp(data.onset_frame, fps),
        'apex_time': get_frame_timestamp(data.apex_frame, fps),
        'offset_time': get_frame_timestamp(data.offset_frame, fps),
    }
    
    _annotations[video_id] = annotation
    logger.info(f"Annotation saved for {video_id}: onset={data.onset_frame}, apex={data.apex_frame}, offset={data.offset_frame}")
    return annotation


@router.get("/{video_id}")
async def get_annotation(video_id: str):
    """Get the current annotation for a video."""
    annotation = _annotations.get(video_id)
    if not annotation:
        raise HTTPException(status_code=404, detail=f"No annotation found for video: {video_id}")
    return annotation


@router.put("/{video_id}")
async def update_annotation(video_id: str, data: AnnotationCreate):
    """Update the annotation for a video."""
    video = get_registered_video(video_id)
    if not video:
        raise HTTPException(status_code=404, detail=f"Video not found: {video_id}")
    
    total = video['total_frames']
    fps = video['fps']
    
    for name, val in [('onset', data.onset_frame), ('apex', data.apex_frame), ('offset', data.offset_frame)]:
        if val < 0 or val >= total:
            raise HTTPException(
                status_code=400,
                detail=f"{name} frame {val} out of range [0, {total - 1}]"
            )
    
    annotation = {
        'video_id': video_id,
        'onset_frame': data.onset_frame,
        'apex_frame': data.apex_frame,
        'offset_frame': data.offset_frame,
        'onset_time': get_frame_timestamp(data.onset_frame, fps),
        'apex_time': get_frame_timestamp(data.apex_frame, fps),
        'offset_time': get_frame_timestamp(data.offset_frame, fps),
    }
    
    _annotations[video_id] = annotation
    return annotation


@router.delete("/{video_id}")
async def delete_annotation(video_id: str):
    """Clear the annotation for a video."""
    if video_id in _annotations:
        del _annotations[video_id]
        return {"message": "Annotation deleted"}
    raise HTTPException(status_code=404, detail=f"No annotation found for video: {video_id}")


def get_annotation_dict(video_id: str) -> dict:
    """Helper to get annotation as dict (for use by other services)."""
    return _annotations.get(video_id)
