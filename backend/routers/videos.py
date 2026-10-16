from fastapi import APIRouter, UploadFile, File, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from io import BytesIO
import os
import logging
import mimetypes

from backend.services.video_service import (
    save_uploaded_video,
    get_registered_video,
    get_all_videos,
    get_frame,
    frame_to_jpeg_bytes,
    get_frame_timestamp,
)
from backend.utils.validators import validate_video_file

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/videos", tags=["videos"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'uploads')


@router.post("/upload")
async def upload_video(file: UploadFile = File(...)):
    """Upload a video file and extract its metadata."""
    if not validate_video_file(file.filename):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: MP4, MOV, AVI. Got: {file.filename}"
        )
    
    try:
        content = await file.read()
        if len(content) == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")
        
        video_info = save_uploaded_video(content, file.filename, UPLOAD_DIR)
        return video_info
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.get("")
async def list_videos():
    """List all uploaded videos."""
    return get_all_videos()


@router.get("/{video_id}/info")
async def get_video_info(video_id: str):
    """Get video metadata."""
    video = get_registered_video(video_id)
    if not video:
        raise HTTPException(status_code=404, detail=f"Video not found: {video_id}")
    return video


@router.get("/{video_id}/frame/{frame_number}")
async def get_video_frame(video_id: str, frame_number: int):
    """Get a specific frame as JPEG image."""
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
    
    jpeg_bytes = frame_to_jpeg_bytes(frame, quality=92)
    return StreamingResponse(
        BytesIO(jpeg_bytes),
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=3600"}
    )


@router.get("/{video_id}/thumbnail/{frame_number}")
async def get_video_thumbnail(video_id: str, frame_number: int):
    """Get a thumbnail of a specific frame."""
    video = get_registered_video(video_id)
    if not video:
        raise HTTPException(status_code=404, detail=f"Video not found: {video_id}")
    
    if frame_number < 0 or frame_number >= video['total_frames']:
        raise HTTPException(
            status_code=400,
            detail=f"Frame {frame_number} out of range [0, {video['total_frames'] - 1}]"
        )
    
    frame = get_frame(video['filepath'], frame_number, as_thumbnail=True, thumb_width=320)
    if frame is None:
        raise HTTPException(status_code=500, detail=f"Could not extract thumbnail for frame {frame_number}")
    
    jpeg_bytes = frame_to_jpeg_bytes(frame, quality=75)
    return StreamingResponse(
        BytesIO(jpeg_bytes),
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=3600"}
    )


def get_video_mime_type(filepath: str) -> str:
    """Determine video MIME type from file extension."""
    ext = os.path.splitext(filepath)[1].lower()
    mimes = {
        '.mp4': 'video/mp4',
        '.m4v': 'video/mp4',
        '.webm': 'video/webm',
        '.mov': 'video/quicktime',
        '.avi': 'video/x-msvideo',
        '.mkv': 'video/x-matroska',
        '.ogv': 'video/ogg',
    }
    return mimes.get(ext, mimetypes.guess_type(filepath)[0] or 'application/octet-stream')


def open_file_chunk_generator(filepath: str, start: int, length: int, chunk_size: int = 128 * 1024):
    """Generator that streams bytes from start for length bytes in chunk_size increments."""
    remaining = length
    with open(filepath, 'rb') as f:
        f.seek(start)
        while remaining > 0:
            bytes_to_read = min(chunk_size, remaining)
            data = f.read(bytes_to_read)
            if not data:
                break
            remaining -= len(data)
            yield data


@router.get("/{video_id}/stream")
@router.get("/{video_id}/video")
async def stream_video(video_id: str, request: Request):
    """
    Stream original uploaded video supporting HTTP 206 Partial Content byte-ranges.
    Provides standard HTML5 video player seeking, continuous playback, and metadata inspection.
    """
    video = get_registered_video(video_id)
    if not video:
        raise HTTPException(status_code=404, detail=f"Video not found: {video_id}")
    
    filepath = video.get('filepath')
    if not filepath or not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail="Video file not found on disk")
    
    file_size = os.path.getsize(filepath)
    mime_type = get_video_mime_type(filepath)
    range_header = request.headers.get('range') or request.headers.get('Range')
    
    if not range_header:
        headers = {
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
            "Content-Type": mime_type,
            "Cache-Control": "public, max-age=3600"
        }
        return StreamingResponse(
            open_file_chunk_generator(filepath, 0, file_size),
            status_code=200,
            media_type=mime_type,
            headers=headers
        )
    
    # Parse Range: bytes=start-end
    try:
        range_val = range_header.strip()
        if not range_val.startswith('bytes='):
            return Response(
                status_code=416,
                headers={"Content-Range": f"bytes */{file_size}", "Accept-Ranges": "bytes"}
            )
        
        range_parts = range_val[6:].split('-')
        start_str = range_parts[0].strip()
        end_str = range_parts[1].strip() if len(range_parts) > 1 else ""
        
        if start_str and end_str:
            start = int(start_str)
            end = int(end_str)
        elif start_str:
            start = int(start_str)
            end = file_size - 1
        elif end_str:
            # Suffix range
            length = int(end_str)
            start = max(0, file_size - length)
            end = file_size - 1
        else:
            return Response(
                status_code=416,
                headers={"Content-Range": f"bytes */{file_size}", "Accept-Ranges": "bytes"}
            )
        
        if start >= file_size or start < 0 or end < start:
            return Response(
                status_code=416,
                headers={"Content-Range": f"bytes */{file_size}", "Accept-Ranges": "bytes"}
            )
            
        end = min(end, file_size - 1)
        content_length = end - start + 1
        
        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(content_length),
            "Content-Type": mime_type,
            "Cache-Control": "public, max-age=3600"
        }
        
        return StreamingResponse(
            open_file_chunk_generator(filepath, start, content_length),
            status_code=206,
            media_type=mime_type,
            headers=headers
        )
    except Exception as e:
        logger.warning(f"Invalid Range header '{range_header}': {e}")
        return Response(
            status_code=416,
            headers={"Content-Range": f"bytes */{file_size}", "Accept-Ranges": "bytes"}
        )


@router.post("/{video_id}/convert-preview")
async def convert_video_preview(video_id: str):
    """
    Generate an H.264 web-compatible MP4 preview if the uploaded format
    cannot be natively decoded by the user's web browser (e.g. legacy AVI / MPEG-4).
    Preserves original recording file completely unchanged.
    """
    from backend.utils.ffmpeg_utils import check_ffmpeg_available, get_ffmpeg_path, run_ffmpeg_command
    
    video = get_registered_video(video_id)
    if not video:
        raise HTTPException(status_code=404, detail=f"Video not found: {video_id}")
    
    filepath = video.get('filepath')
    if not filepath or not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail="Video file not found")
        
    preview_filename = f"{video_id}_browser_preview.mp4"
    preview_path = os.path.join(UPLOAD_DIR, preview_filename)
    
    if os.path.isfile(preview_path):
        return {
            "status": "ready",
            "preview_url": f"/api/videos/{video_id}/stream-preview",
            "message": "Browser preview is ready"
        }
    
    if not check_ffmpeg_available():
        raise HTTPException(
            status_code=503,
            detail="FFmpeg is not available to transcode preview. Please install FFmpeg (e.g. winget install Gyan.FFmpeg) or upload an H.264 MP4."
        )
    
    try:
        ffmpeg = get_ffmpeg_path()
        cmd = [
            ffmpeg,
            '-y',
            '-i', filepath,
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-preset', 'fast',
            '-movflags', '+faststart',
            '-an',
            preview_path
        ]
        res = run_ffmpeg_command(cmd)
        if res.returncode != 0 or not os.path.isfile(preview_path):
            raise HTTPException(status_code=500, detail=f"Transcoding failed: {res.stderr}")
            
        video['preview_path'] = preview_path
        video['preview_url'] = f"/api/videos/{video_id}/stream-preview"
        
        return {
            "status": "created",
            "preview_url": video['preview_url'],
            "message": "Transcoded browser-compatible preview successfully"
        }
    except Exception as e:
        logger.error(f"Transcoding error: {e}")
        raise HTTPException(status_code=500, detail=f"Preview conversion failed: {str(e)}")


@router.get("/{video_id}/stream-preview")
async def stream_preview_video(video_id: str, request: Request):
    """Stream browser-transcoded preview MP4 supporting HTTP byte-ranges."""
    video = get_registered_video(video_id)
    if not video:
        raise HTTPException(status_code=404, detail=f"Video not found: {video_id}")
    
    preview_path = video.get('preview_path')
    if not preview_path or not os.path.isfile(preview_path):
        preview_filename = f"{video_id}_browser_preview.mp4"
        candidate = os.path.join(UPLOAD_DIR, preview_filename)
        if os.path.isfile(candidate):
            preview_path = candidate
            video['preview_path'] = candidate
        else:
            raise HTTPException(status_code=404, detail="Preview video not found. Generate it first via /convert-preview")
            
    file_size = os.path.getsize(preview_path)
    mime_type = "video/mp4"
    range_header = request.headers.get('range') or request.headers.get('Range')
    
    if not range_header:
        headers = {
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
            "Content-Type": mime_type,
            "Cache-Control": "public, max-age=3600"
        }
        return StreamingResponse(
            open_file_chunk_generator(preview_path, 0, file_size),
            status_code=200,
            media_type=mime_type,
            headers=headers
        )
        
    try:
        range_val = range_header.strip()
        range_parts = range_val[6:].split('-')
        start_str = range_parts[0].strip()
        end_str = range_parts[1].strip() if len(range_parts) > 1 else ""
        
        if start_str and end_str:
            start = int(start_str)
            end = int(end_str)
        elif start_str:
            start = int(start_str)
            end = file_size - 1
        elif end_str:
            length = int(end_str)
            start = max(0, file_size - length)
            end = file_size - 1
        else:
            return Response(status_code=416, headers={"Content-Range": f"bytes */{file_size}", "Accept-Ranges": "bytes"})
            
        if start >= file_size or start < 0 or end < start:
            return Response(status_code=416, headers={"Content-Range": f"bytes */{file_size}", "Accept-Ranges": "bytes"})
            
        end = min(end, file_size - 1)
        content_length = end - start + 1
        
        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(content_length),
            "Content-Type": mime_type,
            "Cache-Control": "public, max-age=3600"
        }
        return StreamingResponse(
            open_file_chunk_generator(preview_path, start, content_length),
            status_code=206,
            media_type=mime_type,
            headers=headers
        )
    except Exception:
        return Response(status_code=416, headers={"Content-Range": f"bytes */{file_size}", "Accept-Ranges": "bytes"})
