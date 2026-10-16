from fastapi import APIRouter, HTTPException
import logging

from backend.models.schemas import EnhanceRequest
from backend.services.enhance_service import is_available, get_status, enhance_image

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/enhance", tags=["enhancement"])


@router.get("/status")
async def enhancement_status():
    """Check if super-resolution enhancement is available."""
    return get_status()


@router.post("/apply")
async def apply_enhancement(request: EnhanceRequest):
    """Apply super-resolution enhancement to an image."""
    if not is_available():
        raise HTTPException(
            status_code=503,
            detail="Super-resolution model is not installed. "
                   "Install with: pip install realesrgan basicsr torch torchvision"
        )
    
    try:
        result = enhance_image(
            image_path=request.image_path,
            scale=request.scale
        )
        
        if result is None:
            raise HTTPException(
                status_code=500,
                detail="Enhancement failed. The model may not be properly initialized."
            )
        
        return result
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Enhancement failed: {e}")
        raise HTTPException(status_code=500, detail=f"Enhancement failed: {str(e)}")
