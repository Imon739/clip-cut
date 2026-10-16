import os
import sys
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from contextlib import asynccontextmanager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Base directory paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIR = os.path.join(BASE_DIR, 'frontend')


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events using modern lifespan handler."""
    logger.info("=" * 60)
    logger.info("  Micro-Expression Annotator - Starting")
    logger.info("=" * 60)
    
    # Check FFmpeg
    from backend.utils.ffmpeg_utils import check_ffmpeg_available
    if check_ffmpeg_available():
        logger.info("✓ FFmpeg found")
    else:
        logger.warning("! FFmpeg not found in PATH. Using OpenCV VideoWriter fallback.")
        logger.warning("  For H.264 CRF=10 lossless encoding, install FFmpeg:")
        logger.warning("  winget install Gyan.FFmpeg OR scoop install ffmpeg")
    
    # Check MediaPipe
    try:
        import mediapipe
        logger.info(f"✓ MediaPipe {mediapipe.__version__}")
    except ImportError:
        logger.warning("! MediaPipe not installed. Face detection will be unavailable.")
    
    # Check Real-ESRGAN
    from backend.services.enhance_service import is_available as esrgan_available
    if esrgan_available():
        logger.info("✓ Real-ESRGAN available")
    else:
        logger.info("○ Real-ESRGAN not installed (optional)")
    
    # Create directories
    os.makedirs(os.path.join(BASE_DIR, 'uploads'), exist_ok=True)
    os.makedirs(os.path.join(BASE_DIR, 'dataset'), exist_ok=True)
    
    logger.info(f"  Frontend: {FRONTEND_DIR}")
    logger.info(f"  Server: http://127.0.0.1:8000")
    logger.info("=" * 60)
    
    yield
    
    # Cleanup on shutdown
    try:
        from backend.services.face_service import cleanup
        cleanup()
    except Exception:
        pass
    logger.info("Micro-Expression Annotator - Stopped")


# Create FastAPI app
app = FastAPI(
    title="Micro-Expression Annotator",
    description="Video annotation and clip extraction tool for micro-expression research",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware for localhost
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:8000", "http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import routers
from backend.routers import videos, annotations, clips, frames, cropping, enhancement

# Include routers
app.include_router(videos.router)
app.include_router(annotations.router)
app.include_router(clips.router)
app.include_router(frames.router)
app.include_router(cropping.router)
app.include_router(enhancement.router)

# Get base directory
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIR = os.path.join(BASE_DIR, 'frontend')

# Mount static files
if os.path.isdir(os.path.join(FRONTEND_DIR, 'css')):
    app.mount("/css", StaticFiles(directory=os.path.join(FRONTEND_DIR, 'css')), name="css")
if os.path.isdir(os.path.join(FRONTEND_DIR, 'js')):
    app.mount("/js", StaticFiles(directory=os.path.join(FRONTEND_DIR, 'js')), name="js")


from fastapi import HTTPException
from backend.services.video_service import get_registered_video, get_frame
from backend.services.export_service import (
    create_dataset_structure,
    export_annotation_frames,
    build_metadata,
    save_metadata
)
from backend.services.crop_service import crop_frame, save_crop
from backend.services.clip_service import extract_clip


# Export endpoint
@app.post("/api/export/full")
async def full_export(payload: dict):
    """Perform full structured dataset export."""
    video_id = payload.get("video_id")
    if not video_id:
        raise HTTPException(status_code=400, detail="video_id is required")

    video = get_registered_video(video_id)
    if not video:
        raise HTTPException(status_code=404, detail=f"Video not found: {video_id}")
    
    participant_id = payload.get("participant_id", "participant_001")
    video_label = payload.get("video_label", "video_001")
    base_dir = os.path.join(BASE_DIR, "dataset")
    
    paths = create_dataset_structure(base_dir, participant_id, video_label)
    created_files = []
    
    annotations = payload.get("annotations") or {}
    onset = annotations.get("onset_frame")
    apex = annotations.get("apex_frame")
    offset = annotations.get("offset_frame")
    
    # 1. Export annotation frames if requested
    exported_frames = {}
    if payload.get("export_original_frames", True) and (onset is not None or offset is not None):
        exported_frames = export_annotation_frames(
            video_path=video["filepath"],
            annotation=annotations,
            output_dir=paths["original_frames"],
            format="png",
            video_info=video
        )
        created_files.extend(list(exported_frames.values()))
        
    # 2. Export cropped frames if requested
    cropped_frames = {}
    crop_box = payload.get("crop_box")
    if payload.get("export_cropped_frames", True) and crop_box:
        cx = int(crop_box.get("x", 0))
        cy = int(crop_box.get("y", 0))
        cw = int(crop_box.get("width", 100))
        ch = int(crop_box.get("height", 100))
        
        for key, frame_idx in [("onset", onset), ("apex", apex), ("offset", offset)]:
            if frame_idx is not None:
                frm = get_frame(video["filepath"], frame_idx)
                if frm is not None:
                    crp = crop_frame(frm, cx, cy, cw, ch)
                    c_path = os.path.join(paths["cropped_frames"], f"frame_{frame_idx:06d}_cropped.png")
                    save_crop(crp, c_path, format="png")
                    cropped_frames[key] = c_path
                    created_files.append(c_path)
                    
    # 3. Export clip if requested
    clip_info = None
    if payload.get("export_clip", True) and onset is not None and offset is not None and onset < offset:
        try:
            clip_info = extract_clip(
                video_info=video,
                start_frame=onset,
                end_frame=offset,
                context_before=int(payload.get("context_frames_before", 0)),
                context_after=int(payload.get("context_frames_after", 0)),
                output_dir=paths["video"]
            )
            if clip_info and clip_info.get("filepath"):
                created_files.append(clip_info["filepath"])
        except Exception as e:
            logger.warning(f"Clip export error in full export: {e}")
            
    # 4. Save metadata.json
    meta = build_metadata(
        video_info=video,
        annotation=annotations,
        clip_info=clip_info,
        crop_coords=crop_box,
        processing_options={
            "clip_encoding": clip_info.get("encoding_note") if clip_info else "h264_crf10",
            "frame_format": "png",
            "offset_inclusive": True
        },
        participant_id=participant_id
    )
    if exported_frames:
        meta["exported_frames"] = exported_frames
    if cropped_frames:
        meta["cropped_frames"] = cropped_frames
        
    meta_path = save_metadata(meta, paths["video"])
    created_files.append(meta_path)
    
    # Calculate total size
    total_bytes = 0
    for f in created_files:
        if os.path.isfile(f):
            total_bytes += os.path.getsize(f)
    size_mb = f"{total_bytes / (1024 * 1024):.2f} MB" if total_bytes > 0 else "< 1 MB"
    
    return {
        "success": True,
        "export_dir": paths["video"],
        "files": created_files,
        "total_size_mb": size_mb,
        "metadata": meta
    }



# Serve frontend
@app.get("/")
async def serve_frontend():
    """Serve the main frontend page."""
    index_path = os.path.join(FRONTEND_DIR, 'index.html')
    if os.path.isfile(index_path):
        return FileResponse(index_path)
    return {"message": "Frontend not found. Place index.html in the frontend directory."}


# Run with uvicorn
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        log_level="info"
    )
