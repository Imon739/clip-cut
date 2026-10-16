import subprocess
import shutil
import json
import os
import logging

logger = logging.getLogger(__name__)


def get_ffmpeg_path() -> str:
    """Locate the ffmpeg binary."""
    path = shutil.which('ffmpeg')
    if path:
        return path
    # Check common Windows locations
    common_paths = [
        r'C:\ffmpeg\bin\ffmpeg.exe',
        r'C:\Program Files\ffmpeg\bin\ffmpeg.exe',
        r'C:\ProgramData\chocolatey\bin\ffmpeg.exe',
    ]
    for p in common_paths:
        if os.path.isfile(p):
            return p
    raise FileNotFoundError(
        'FFmpeg not found. Please install FFmpeg and add it to your PATH. '
        'See README.md for installation instructions.'
    )


def get_ffprobe_path() -> str:
    """Locate the ffprobe binary."""
    path = shutil.which('ffprobe')
    if path:
        return path
    common_paths = [
        r'C:\ffmpeg\bin\ffprobe.exe',
        r'C:\Program Files\ffmpeg\bin\ffprobe.exe',
        r'C:\ProgramData\chocolatey\bin\ffprobe.exe',
    ]
    for p in common_paths:
        if os.path.isfile(p):
            return p
    raise FileNotFoundError(
        'FFprobe not found. Please install FFmpeg (includes ffprobe) and add it to your PATH.'
    )


def check_ffmpeg_available() -> bool:
    """Check if FFmpeg is available on the system."""
    try:
        get_ffmpeg_path()
        return True
    except FileNotFoundError:
        return False


def get_video_info_ffprobe(filepath: str) -> dict:
    """Use ffprobe to get detailed video information."""
    try:
        ffprobe = get_ffprobe_path()
    except FileNotFoundError:
        return {}

    cmd = [
        ffprobe,
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        filepath
    ]

    result = run_ffmpeg_command(cmd)
    if result.returncode != 0:
        logger.error(f'ffprobe failed: {result.stderr}')
        return {}

    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError:
        logger.error('Failed to parse ffprobe output')
        return {}

    # Find video stream
    video_stream = None
    for stream in data.get('streams', []):
        if stream.get('codec_type') == 'video':
            video_stream = stream
            break

    if not video_stream:
        return {}

    # Parse FPS from r_frame_rate (e.g., "240/1")
    fps = 0.0
    r_frame_rate = video_stream.get('r_frame_rate', '0/1')
    if '/' in r_frame_rate:
        num, den = r_frame_rate.split('/')
        if int(den) != 0:
            fps = int(num) / int(den)
    else:
        fps = float(r_frame_rate)

    return {
        'width': int(video_stream.get('width', 0)),
        'height': int(video_stream.get('height', 0)),
        'fps': fps,
        'total_frames': int(video_stream.get('nb_frames', 0)),
        'duration': float(data.get('format', {}).get('duration', 0)),
        'codec': video_stream.get('codec_name', 'unknown'),
    }


def extract_clip(
    input_path: str,
    output_path: str,
    start_frame: int,
    end_frame: int,
    fps: float,
    crf: int = 10
) -> dict:
    """
    Extract a clip using frame-accurate re-encoding.
    
    The offset frame is INCLUSIVE: both start_frame and end_frame are included.
    Uses FFmpeg select filter for exact frame boundaries.
    Re-encodes with CRF 10 (visually lossless) because stream-copy cannot
    guarantee exact frame boundaries mid-GOP.
    
    Returns dict with actual frame count, duration, and success status.
    """
    ffmpeg = get_ffmpeg_path()

    # Calculate time-based seeking for efficiency (seek to just before start)
    seek_time = max(0, (start_frame / fps) - 0.5)  # 0.5s before for safety
    
    # Duration with padding
    expected_frames = end_frame - start_frame + 1  # inclusive
    duration_needed = (expected_frames / fps) + 1.0  # extra second for safety

    # Use select filter for exact frame selection
    # Adjust frame numbers relative to the seek position
    select_expr = f"between(n\\,{start_frame}\\,{end_frame})"
    
    # Strategy: seek near start, then use select filter on absolute frame numbers
    # We need to use -ss on input for fast seeking, but select filter uses
    # frame numbers relative to what the decoder outputs.
    # So we seek to the start frame via time, then select the first N frames.
    
    start_time = start_frame / fps
    end_time = (end_frame + 1) / fps  # +1 because inclusive
    
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    cmd = [
        ffmpeg,
        '-y',  # Overwrite output
        '-ss', f'{start_time:.6f}',  # Seek to start time
        '-i', input_path,
        '-t', f'{(end_time - start_time):.6f}',  # Duration
        '-c:v', 'libx264',
        '-crf', str(crf),
        '-preset', 'medium',
        '-an',  # No audio for micro-expression clips
        '-r', str(fps),  # Preserve original FPS
        '-fps_mode', 'cfr',  # Constant frame rate
        output_path
    ]

    logger.info(f'Extracting clip: frames {start_frame}-{end_frame} (inclusive), expected {expected_frames} frames')
    result = run_ffmpeg_command(cmd)

    if result.returncode != 0:
        logger.error(f'FFmpeg clip extraction failed: {result.stderr}')
        # Try alternative method with select filter
        return _extract_clip_select_filter(
            input_path, output_path, start_frame, end_frame, fps, crf
        )

    # Verify output
    verification = verify_clip(output_path)
    actual_frames = verification.get('total_frames', 0)
    
    # If frame count is off by more than 1, try select filter method
    if abs(actual_frames - expected_frames) > 1:
        logger.warning(
            f'Frame count mismatch: expected {expected_frames}, got {actual_frames}. '
            f'Retrying with select filter method.'
        )
        return _extract_clip_select_filter(
            input_path, output_path, start_frame, end_frame, fps, crf
        )

    return {
        'success': True,
        'output_path': output_path,
        'expected_frames': expected_frames,
        'actual_frames': actual_frames,
        'duration': verification.get('duration', 0),
        'fps': verification.get('fps', fps),
        'method': 'time_based_seek',
    }


def _extract_clip_select_filter(
    input_path: str,
    output_path: str,
    start_frame: int,
    end_frame: int,
    fps: float,
    crf: int = 10
) -> dict:
    """Fallback: use select filter for precise frame selection."""
    ffmpeg = get_ffmpeg_path()
    expected_frames = end_frame - start_frame + 1

    cmd = [
        ffmpeg,
        '-y',
        '-i', input_path,
        '-vf', f"select='between(n,{start_frame},{end_frame})',setpts=N/({fps}*TB)",
        '-c:v', 'libx264',
        '-crf', str(crf),
        '-preset', 'medium',
        '-an',
        '-r', str(fps),
        '-fps_mode', 'cfr',
        output_path
    ]

    logger.info(f'Select filter extraction: frames {start_frame}-{end_frame}')
    result = run_ffmpeg_command(cmd)

    if result.returncode != 0:
        logger.error(f'Select filter extraction failed: {result.stderr}')
        return {
            'success': False,
            'error': result.stderr,
            'expected_frames': expected_frames,
        }

    verification = verify_clip(output_path)
    return {
        'success': True,
        'output_path': output_path,
        'expected_frames': expected_frames,
        'actual_frames': verification.get('total_frames', 0),
        'duration': verification.get('duration', 0),
        'fps': verification.get('fps', fps),
        'method': 'select_filter',
    }


def verify_clip(filepath: str) -> dict:
    """Use ffprobe to verify the frame count, FPS, and duration of a clip."""
    try:
        ffprobe = get_ffprobe_path()
    except FileNotFoundError:
        return {}

    cmd = [
        ffprobe,
        '-v', 'quiet',
        '-count_frames',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=nb_read_frames,r_frame_rate,duration',
        '-show_entries', 'format=duration',
        '-print_format', 'json',
        filepath
    ]

    result = run_ffmpeg_command(cmd)
    if result.returncode != 0:
        return {}

    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError:
        return {}

    video_stream = None
    for stream in data.get('streams', []):
        video_stream = stream
        break

    if not video_stream:
        return {}

    fps = 0.0
    r_frame_rate = video_stream.get('r_frame_rate', '0/1')
    if '/' in r_frame_rate:
        num, den = r_frame_rate.split('/')
        if int(den) != 0:
            fps = int(num) / int(den)
    else:
        fps = float(r_frame_rate)

    total_frames = int(video_stream.get('nb_read_frames', 0))
    duration = float(video_stream.get('duration', 0) or data.get('format', {}).get('duration', 0))

    return {
        'total_frames': total_frames,
        'fps': fps,
        'duration': duration,
    }


def run_ffmpeg_command(cmd: list) -> subprocess.CompletedProcess:
    """Run an FFmpeg/FFprobe command and return the result."""
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300,  # 5 minute timeout
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
        )
        return result
    except subprocess.TimeoutExpired:
        logger.error(f'Command timed out: {" ".join(cmd[:3])}...')
        return subprocess.CompletedProcess(cmd, 1, '', 'Command timed out')
    except FileNotFoundError as e:
        logger.error(f'Command not found: {e}')
        return subprocess.CompletedProcess(cmd, 1, '', str(e))
