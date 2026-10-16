from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional, List, Dict, Any
from datetime import datetime
import uuid


class VideoInfo(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    filename: str
    filepath: str
    width: int
    height: int
    fps: float
    total_frames: int
    duration: float
    codec: str = "unknown"
    stream_url: Optional[str] = None
    uploaded_at: str = Field(default_factory=lambda: datetime.now().isoformat())


class AnnotationCreate(BaseModel):
    onset_frame: int = Field(ge=0)
    apex_frame: int = Field(ge=0)
    offset_frame: int = Field(ge=0)

    @model_validator(mode='after')
    def validate_order(self):
        if not (self.onset_frame < self.apex_frame < self.offset_frame):
            raise ValueError(
                f'Frame order must be onset ({self.onset_frame}) < apex ({self.apex_frame}) < offset ({self.offset_frame})'
            )
        return self


class Annotation(BaseModel):
    video_id: str
    onset_frame: int
    apex_frame: int
    offset_frame: int
    onset_time: float = 0.0
    apex_time: float = 0.0
    offset_time: float = 0.0


class ClipRequest(BaseModel):
    video_id: str
    onset_frame: int = Field(ge=0)
    offset_frame: int = Field(ge=0)
    context_frames_before: int = Field(default=0, ge=0)
    context_frames_after: int = Field(default=0, ge=0)
    participant_id: str = "participant_001"
    video_label: str = "video_001"

    @model_validator(mode='after')
    def validate_range(self):
        if self.onset_frame >= self.offset_frame:
            raise ValueError('onset_frame must be less than offset_frame')
        return self


class ClipInfo(BaseModel):
    clip_id: str
    source_video: str
    source_video_id: str
    start_frame: int
    end_frame: int
    frame_count: int
    duration: float
    fps: float
    filepath: str
    filename: str
    includes_context: bool = False
    context_before: int = 0
    context_after: int = 0
    offset_inclusive: bool = True
    encoding_note: str = "h264 crf=10 (visually lossless re-encode for frame accuracy)"


class CropRequest(BaseModel):
    video_id: str
    frame_number: int = Field(ge=0)
    x: int = Field(ge=0)
    y: int = Field(ge=0)
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    preset: Optional[str] = None
    participant_id: str = "participant_001"
    video_label: str = "video_001"
    format: str = "png"

    @field_validator('preset')
    @classmethod
    def validate_preset(cls, v):
        if v is not None and v not in ('full_face', 'eyes', 'eyebrows', 'mouth'):
            raise ValueError(f'Invalid preset: {v}. Must be one of: full_face, eyes, eyebrows, mouth')
        return v

    @field_validator('format')
    @classmethod
    def validate_format(cls, v):
        if v not in ('jpg', 'jpeg', 'png'):
            raise ValueError('Format must be jpg, jpeg, or png')
        return v


class CropResult(BaseModel):
    original_path: str
    cropped_path: str
    coordinates: Dict[str, int]
    preset_used: Optional[str] = None


class CropDetectResult(BaseModel):
    x: int
    y: int
    width: int
    height: int
    confidence: float = 0.0


class PresetRequest(BaseModel):
    preset: str

    @field_validator('preset')
    @classmethod
    def validate_preset(cls, v):
        if v not in ('full_face', 'eyes', 'eyebrows', 'mouth'):
            raise ValueError(f'Invalid preset: {v}. Must be one of: full_face, eyes, eyebrows, mouth')
        return v


class FrameExportRequest(BaseModel):
    video_id: str
    frame_numbers: List[int]
    format: str = "png"
    participant_id: str = "participant_001"
    video_label: str = "video_001"

    @field_validator('format')
    @classmethod
    def validate_format(cls, v):
        if v not in ('jpg', 'jpeg', 'png'):
            raise ValueError('Format must be jpg, jpeg, or png')
        return v

    @field_validator('frame_numbers')
    @classmethod
    def validate_frames(cls, v):
        if not v:
            raise ValueError('frame_numbers must not be empty')
        return v


class AnnotationExportRequest(BaseModel):
    video_id: str
    participant_id: str = "participant_001"
    video_label: str = "video_001"
    format: str = "png"

    @field_validator('format')
    @classmethod
    def validate_format(cls, v):
        if v not in ('jpg', 'jpeg', 'png'):
            raise ValueError('Format must be jpg, jpeg, or png')
        return v


class EnhanceRequest(BaseModel):
    image_path: str
    scale: int = 2

    @field_validator('scale')
    @classmethod
    def validate_scale(cls, v):
        if v not in (2, 4):
            raise ValueError('Scale must be 2 or 4')
        return v


class EnhanceStatus(BaseModel):
    available: bool
    model_name: Optional[str] = None
    supported_scales: List[int] = [2, 4]


class EnhanceResult(BaseModel):
    original_path: str
    enhanced_path: str
    scale: int
    disclaimer: str = "AI-upscaled image. Upscaling does not recover real details absent from the original recording."


class ExportRequest(BaseModel):
    video_id: str
    participant_id: str = "participant_001"
    video_label: str = "video_001"
    output_directory: str = "./dataset"
    include_original_frames: bool = True
    include_cropped_frames: bool = True
    include_enhanced_frames: bool = False
    include_clip: bool = True
    include_metadata: bool = True
    frame_format: str = "png"


class DatasetMetadata(BaseModel):
    participant_id: str
    source_video: str
    original_fps: float
    original_resolution: Dict[str, int]
    codec: str = "unknown"
    annotation: Optional[Dict[str, Any]] = None
    clip: Optional[Dict[str, Any]] = None
    crop: Optional[Dict[str, Any]] = None
    exported_frames: Optional[Dict[str, str]] = None
    cropped_frames: Optional[Dict[str, str]] = None
    enhanced_frames: Optional[Dict[str, Any]] = None
    processing_options: Optional[Dict[str, Any]] = None
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
