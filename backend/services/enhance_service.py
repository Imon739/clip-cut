import os
import logging
import numpy as np
from typing import Optional, Dict
from PIL import Image

logger = logging.getLogger(__name__)

_upsampler = None
_available = None


def _check_availability() -> bool:
    """Check if Real-ESRGAN is installed and usable."""
    global _available
    if _available is not None:
        return _available
    
    try:
        from realesrgan import RealESRGANer
        from basicsr.archs.rrdbnet_arch import RRDBNet
        _available = True
        logger.info("Real-ESRGAN is available")
    except ImportError:
        _available = False
        logger.info("Real-ESRGAN is not installed. Enhancement features disabled.")
    except Exception as e:
        _available = False
        logger.warning(f"Real-ESRGAN check failed: {e}")
    
    return _available


def _get_upsampler(scale: int = 2):
    """Get or create the Real-ESRGAN upsampler."""
    global _upsampler
    if _upsampler is not None:
        return _upsampler
    
    if not _check_availability():
        return None
    
    try:
        from realesrgan import RealESRGANer
        from basicsr.archs.rrdbnet_arch import RRDBNet
        import torch
        
        model = RRDBNet(
            num_in_ch=3, num_out_ch=3, num_feat=64,
            num_block=23, num_grow_ch=32, scale=scale
        )
        
        model_path = None
        # Try to find model weights
        possible_paths = [
            os.path.join(os.path.dirname(__file__), '..', '..', 'models', 'RealESRGAN_x2plus.pth'),
            os.path.join(os.path.expanduser('~'), '.cache', 'realesrgan', 'RealESRGAN_x2plus.pth'),
        ]
        for path in possible_paths:
            if os.path.isfile(path):
                model_path = path
                break
        
        device = 'cuda' if torch.cuda.is_available() else 'cpu'
        
        _upsampler = RealESRGANer(
            scale=scale,
            model_path=model_path,
            model=model,
            device=device,
            half=False
        )
        
        return _upsampler
    except Exception as e:
        logger.error(f"Failed to initialize Real-ESRGAN: {e}")
        return None


def is_available() -> bool:
    """Check if super-resolution enhancement is available."""
    return _check_availability()


def get_status() -> Dict:
    """Get the status of the enhancement service."""
    available = _check_availability()
    return {
        'available': available,
        'model_name': 'Real-ESRGAN' if available else None,
        'supported_scales': [2, 4] if available else [],
    }


def enhance_image(
    image_path: str,
    scale: int = 2,
    output_path: Optional[str] = None
) -> Optional[Dict]:
    """
    Enhance an image using Real-ESRGAN.
    
    Args:
        image_path: path to the input image
        scale: upscaling factor (2 or 4)
        output_path: optional output path. If None, auto-generated.
    
    Returns:
        Dict with original_path, enhanced_path, scale, disclaimer
        or None if enhancement is unavailable
    """
    if not is_available():
        return None
    
    if not os.path.isfile(image_path):
        raise FileNotFoundError(f"Image not found: {image_path}")
    
    if scale not in (2, 4):
        raise ValueError("Scale must be 2 or 4")
    
    # Generate output path
    if output_path is None:
        base, ext = os.path.splitext(image_path)
        output_path = f"{base}_enhanced_{scale}x{ext}"
    
    os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
    
    try:
        # Read image
        import cv2
        img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
        if img is None:
            raise ValueError(f"Could not read image: {image_path}")
        
        upsampler = _get_upsampler(scale)
        if upsampler is None:
            return None
        
        # Enhance
        output, _ = upsampler.enhance(img, outscale=scale)
        
        # Save
        cv2.imwrite(output_path, output)
        
        logger.info(f"Enhanced image saved: {output_path} ({scale}x)")
        
        return {
            'original_path': image_path,
            'enhanced_path': output_path,
            'scale': scale,
            'disclaimer': 'AI-upscaled image. Upscaling does not recover real details absent from the original recording.',
        }
    except Exception as e:
        logger.error(f"Enhancement failed: {e}")
        raise RuntimeError(f"Enhancement failed: {e}")
