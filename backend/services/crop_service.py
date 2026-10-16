import numpy as np
import os
import logging
from PIL import Image
from typing import Tuple

logger = logging.getLogger(__name__)


def crop_frame(image: np.ndarray, x: int, y: int, width: int, height: int) -> np.ndarray:
    """Crop a rectangular region from the image."""
    h, w = image.shape[:2]
    # Clamp coordinates to image bounds
    x1 = max(0, min(x, w - 1))
    y1 = max(0, min(y, h - 1))
    x2 = max(x1 + 1, min(x + width, w))
    y2 = max(y1 + 1, min(y + height, h))
    
    return image[y1:y2, x1:x2].copy()


def save_crop(image: np.ndarray, output_path: str, format: str = 'png') -> str:
    """Save a cropped image to a file."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    img = Image.fromarray(image)
    
    if format.lower() in ('jpg', 'jpeg'):
        # Convert RGBA to RGB if needed
        if img.mode == 'RGBA':
            img = img.convert('RGB')
        img.save(output_path, format='JPEG', quality=95)
    else:
        img.save(output_path, format='PNG')
    
    logger.info(f"Saved cropped image: {output_path}")
    return output_path


def validate_and_adjust_crop(
    x: int, y: int, w: int, h: int,
    img_w: int, img_h: int
) -> Tuple[int, int, int, int]:
    """Validate and adjust crop coordinates to fit within image bounds."""
    # Clamp starting position
    x = max(0, min(x, img_w - 1))
    y = max(0, min(y, img_h - 1))
    
    # Clamp dimensions
    w = max(1, min(w, img_w - x))
    h = max(1, min(h, img_h - y))
    
    return x, y, w, h
