from fastapi import APIRouter, HTTPException
import os
import logging

from backend.models.schemas import FrameExportRequest, AnnotationExportRequest
from backend.services.video_service import get_registered_video
from backend.services.export_service import export_frames, export_annotation_frames
from backend.routers.annotations import get_annotation_dict

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/frames", tags=["frames"])


@router.post("/export")
async def export_video_frames(request: FrameExportRequest):
    """Export specific frames as image files."""
    video = get_registered_video(request.video_id)
    if not video:
        raise HTTPException(status_code=404, detail=f"Video not found: {request.video_id}")
    
    total = video['total_frames']
    
    # Validate all frame numbers
    invalid_frames = [f for f in request.frame_numbers if f < 0 or f >= total]
    if invalid_frames:
        raise HTTPException(
            status_code=400,
            detail=f"Frame(s) out of range [0, {total - 1}]: {invalid_frames}"
        )
    
    try:
        output_dir = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            'dataset',
            request.participant_id,
            request.video_label,
            'original_frames'
        )
        
        exported = export_frames(
            video_path=video['filepath'],
            frame_numbers=request.frame_numbers,
            output_dir=output_dir,
            format=request.format,
            video_info=video
        )
        
        return {
            'exported_files': exported,
            'count': len(exported),
            'format': request.format,
            'output_directory': output_dir,
        }
    except Exception as e:
        logger.error(f"Frame export failed: {e}")
        raise HTTPException(status_code=500, detail=f"Frame export failed: {str(e)}")


@router.post("/export-annotation")
async def export_annotation_video_frames(request: AnnotationExportRequest):
    """Export the onset, apex, and offset frames."""
    video = get_registered_video(request.video_id)
    if not video:
        raise HTTPException(status_code=404, detail=f"Video not found: {request.video_id}")
    
    annotation = get_annotation_dict(request.video_id)
    if not annotation:
        raise HTTPException(
            status_code=404,
            detail=f"No annotation found for video: {request.video_id}. Set onset/apex/offset first."
        )
    
    try:
        output_dir = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            'dataset',
            request.participant_id,
            request.video_label,
            'original_frames'
        )
        
        result = export_annotation_frames(
            video_path=video['filepath'],
            annotation=annotation,
            output_dir=output_dir,
            format=request.format,
            video_info=video
        )
        
        return {
            'exported_frames': result,
            'count': len(result),
            'format': request.format,
            'output_directory': output_dir,
        }
    except Exception as e:
        logger.error(f"Annotation frame export failed: {e}")
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")
