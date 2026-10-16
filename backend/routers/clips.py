from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
import os
import logging

from backend.models.schemas import ClipRequest
from backend.services.video_service import get_registered_video
from backend.services.clip_service import extract_clip, get_clip, get_clip_path

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/clips", tags=["clips"])


@router.post("/extract")
async def extract_video_clip(request: ClipRequest):
    """Extract a clip from onset to offset (inclusive) with optional context frames."""
    video = get_registered_video(request.video_id)
    if not video:
        raise HTTPException(status_code=404, detail=f"Video not found: {request.video_id}")
    
    total = video['total_frames']
    
    # Validate frame ranges
    if request.onset_frame < 0 or request.onset_frame >= total:
        raise HTTPException(
            status_code=400,
            detail=f"Onset frame {request.onset_frame} out of range [0, {total - 1}]"
        )
    if request.offset_frame < 0 or request.offset_frame >= total:
        raise HTTPException(
            status_code=400,
            detail=f"Offset frame {request.offset_frame} out of range [0, {total - 1}]"
        )
    
    try:
        output_dir = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            'dataset',
            request.participant_id,
            request.video_label
        )
        
        clip_info = extract_clip(
            video_info=video,
            start_frame=request.onset_frame,
            end_frame=request.offset_frame,
            context_before=request.context_frames_before,
            context_after=request.context_frames_after,
            output_dir=output_dir
        )
        
        return clip_info
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Clip extraction failed: {e}")
        raise HTTPException(status_code=500, detail=f"Clip extraction failed: {str(e)}")


@router.get("/{clip_id}/info")
async def get_clip_info(clip_id: str):
    """Get clip metadata."""
    clip = get_clip(clip_id)
    if not clip:
        raise HTTPException(status_code=404, detail=f"Clip not found: {clip_id}")
    return clip


@router.get("/{clip_id}/preview")
async def preview_clip(clip_id: str):
    """Stream the clip for browser preview."""
    clip_path = get_clip_path(clip_id)
    if not clip_path or not os.path.isfile(clip_path):
        raise HTTPException(status_code=404, detail=f"Clip not found: {clip_id}")
    
    return FileResponse(
        clip_path,
        media_type="video/mp4",
        headers={
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=3600"
        }
    )


@router.get("/{clip_id}/download")
async def download_clip(clip_id: str):
    """Download the extracted clip."""
    clip = get_clip(clip_id)
    if not clip:
        raise HTTPException(status_code=404, detail=f"Clip not found: {clip_id}")
    
    clip_path = clip.get('filepath')
    if not clip_path or not os.path.isfile(clip_path):
        raise HTTPException(status_code=404, detail="Clip file not found on disk")
    
    return FileResponse(
        clip_path,
        media_type="video/mp4",
        filename=clip.get('filename', f'clip_{clip_id}.mp4'),
        headers={"Content-Disposition": f"attachment; filename={clip.get('filename', f'clip_{clip_id}.mp4')}"}
    )
