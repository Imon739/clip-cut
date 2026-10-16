import os
import json
import logging
import shutil
from datetime import datetime
from typing import Optional, List, Dict, Any

from backend.services.video_service import get_frame, save_frame_to_file, get_frame_timestamp

logger = logging.getLogger(__name__)


def create_dataset_structure(
    base_dir: str,
    participant_id: str,
    video_label: str
) -> Dict[str, str]:
    """Create the organized dataset directory structure."""
    participant_dir = os.path.join(base_dir, participant_id)
    video_dir = os.path.join(participant_dir, video_label)
    
    paths = {
        'base': base_dir,
        'participant': participant_dir,
        'video': video_dir,
        'original_frames': os.path.join(video_dir, 'original_frames'),
        'cropped_frames': os.path.join(video_dir, 'cropped_frames'),
        'enhanced_frames': os.path.join(video_dir, 'enhanced_frames'),
        'clips': os.path.join(video_dir, 'clips'),
    }
    
    for path in paths.values():
        os.makedirs(path, exist_ok=True)
    
    logger.info(f"Created dataset structure at {video_dir}")
    return paths


def export_frames(
    video_path: str,
    frame_numbers: List[int],
    output_dir: str,
    format: str = 'png',
    video_info: Optional[dict] = None
) -> List[str]:
    """Export specific frames as image files."""
    os.makedirs(output_dir, exist_ok=True)
    exported = []
    
    for frame_num in frame_numbers:
        frame = get_frame(video_path, frame_num)
        if frame is None:
            logger.warning(f"Could not extract frame {frame_num}")
            continue
        
        ext = 'jpg' if format in ('jpg', 'jpeg') else 'png'
        filename = f"frame_{frame_num:06d}.{ext}"
        output_path = os.path.join(output_dir, filename)
        
        save_frame_to_file(frame, output_path, format)
        exported.append(output_path)
        logger.info(f"Exported frame {frame_num} -> {output_path}")
    
    return exported


def export_annotation_frames(
    video_path: str,
    annotation: Dict[str, Any],
    output_dir: str,
    format: str = 'png',
    video_info: Optional[dict] = None
) -> Dict[str, str]:
    """Export onset, apex, and offset frames."""
    os.makedirs(output_dir, exist_ok=True)
    result = {}
    
    for key in ('onset_frame', 'apex_frame', 'offset_frame'):
        frame_num = annotation.get(key)
        if frame_num is None:
            continue
        
        frame = get_frame(video_path, frame_num)
        if frame is None:
            logger.warning(f"Could not extract {key}: frame {frame_num}")
            continue
        
        label = key.replace('_frame', '')
        ext = 'jpg' if format in ('jpg', 'jpeg') else 'png'
        filename = f"frame_{frame_num:06d}.{ext}"
        output_path = os.path.join(output_dir, filename)
        
        save_frame_to_file(frame, output_path, format)
        result[label] = output_path
        logger.info(f"Exported {label} frame {frame_num} -> {output_path}")
    
    return result


def save_metadata(metadata: Dict[str, Any], output_dir: str) -> str:
    """Save metadata as JSON file."""
    os.makedirs(output_dir, exist_ok=True)
    metadata_path = os.path.join(output_dir, 'metadata.json')
    
    with open(metadata_path, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False, default=str)
    
    logger.info(f"Saved metadata to {metadata_path}")
    return metadata_path


def build_metadata(
    video_info: dict,
    annotation: Optional[Dict] = None,
    clip_info: Optional[Dict] = None,
    crop_coords: Optional[Dict] = None,
    processing_options: Optional[Dict] = None,
    enhanced_mapping: Optional[Dict] = None,
    participant_id: str = "participant_001",
) -> Dict[str, Any]:
    """Build complete metadata dictionary."""
    fps = video_info.get('fps', 0)
    
    metadata = {
        'participant_id': participant_id,
        'source_video': video_info.get('filename', ''),
        'original_fps': fps,
        'original_resolution': {
            'width': video_info.get('width', 0),
            'height': video_info.get('height', 0),
        },
        'codec': video_info.get('codec', 'unknown'),
        'created_at': datetime.now().isoformat(),
    }
    
    if annotation:
        metadata['annotation'] = {
            'onset_frame': annotation.get('onset_frame'),
            'onset_timestamp': get_frame_timestamp(annotation.get('onset_frame', 0), fps),
            'apex_frame': annotation.get('apex_frame'),
            'apex_timestamp': get_frame_timestamp(annotation.get('apex_frame', 0), fps),
            'offset_frame': annotation.get('offset_frame'),
            'offset_timestamp': get_frame_timestamp(annotation.get('offset_frame', 0), fps),
        }
    
    if clip_info:
        metadata['clip'] = {
            'filename': clip_info.get('filename', ''),
            'frame_count': clip_info.get('frame_count', 0),
            'duration_seconds': clip_info.get('duration', 0),
            'fps': clip_info.get('fps', fps),
            'context_frames_before': clip_info.get('context_before', 0),
            'context_frames_after': clip_info.get('context_after', 0),
            'offset_inclusive': True,
            'encoding': clip_info.get('encoding_note', ''),
        }
    
    if crop_coords:
        metadata['crop'] = crop_coords
    
    if processing_options:
        metadata['processing_options'] = processing_options
    
    if enhanced_mapping:
        metadata['enhanced_frames'] = {
            'mapping': enhanced_mapping,
            'disclaimer': 'AI-upscaled images. Upscaling does not recover real details absent from the original recording.',
        }
    
    return metadata
