import os
import re

ALLOWED_VIDEO_EXTENSIONS = {'.mp4', '.mov', '.avi'}
ALLOWED_IMAGE_FORMATS = {'jpg', 'jpeg', 'png'}


def validate_video_file(filename: str) -> bool:
    """Check if the file has an allowed video extension."""
    if not filename:
        return False
    ext = os.path.splitext(filename)[1].lower()
    return ext in ALLOWED_VIDEO_EXTENSIONS


def validate_frame_range(frame: int, total_frames: int) -> bool:
    """Check if a frame number is within the valid range [0, total_frames)."""
    return 0 <= frame < total_frames


def validate_annotation_order(onset: int, apex: int, offset: int) -> bool:
    """Check that onset < apex < offset."""
    return onset < apex < offset


def validate_crop_bounds(x: int, y: int, w: int, h: int,
                         img_width: int, img_height: int) -> bool:
    """Check that crop rectangle is within image bounds."""
    if x < 0 or y < 0 or w <= 0 or h <= 0:
        return False
    if x + w > img_width or y + h > img_height:
        return False
    return True


def validate_output_format(fmt: str) -> bool:
    """Check if the output format is supported."""
    return fmt.lower() in ALLOWED_IMAGE_FORMATS


def sanitize_filename(name: str) -> str:
    """Remove or replace characters that are unsafe in filenames."""
    # Replace spaces and special characters
    sanitized = re.sub(r'[^\w\-.]', '_', name)
    # Remove leading/trailing dots and underscores
    sanitized = sanitized.strip('._')
    # Collapse multiple underscores
    sanitized = re.sub(r'_+', '_', sanitized)
    return sanitized if sanitized else 'unnamed'
