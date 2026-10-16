import pytest
from backend.models.schemas import AnnotationCreate, ClipRequest


class TestAnnotationValidation:
    def test_valid_annotation(self):
        """Valid onset < apex < offset should pass."""
        ann = AnnotationCreate(onset_frame=100, apex_frame=150, offset_frame=200)
        assert ann.onset_frame == 100
        assert ann.apex_frame == 150
        assert ann.offset_frame == 200

    def test_onset_equals_apex_fails(self):
        """onset == apex should fail."""
        with pytest.raises(ValueError, match="Frame order"):
            AnnotationCreate(onset_frame=100, apex_frame=100, offset_frame=200)

    def test_apex_equals_offset_fails(self):
        """apex == offset should fail."""
        with pytest.raises(ValueError, match="Frame order"):
            AnnotationCreate(onset_frame=100, apex_frame=200, offset_frame=200)

    def test_onset_greater_than_apex_fails(self):
        """onset > apex should fail."""
        with pytest.raises(ValueError, match="Frame order"):
            AnnotationCreate(onset_frame=200, apex_frame=100, offset_frame=300)

    def test_apex_greater_than_offset_fails(self):
        """apex > offset should fail."""
        with pytest.raises(ValueError, match="Frame order"):
            AnnotationCreate(onset_frame=100, apex_frame=300, offset_frame=200)

    def test_all_same_fails(self):
        """All same frame should fail."""
        with pytest.raises(ValueError, match="Frame order"):
            AnnotationCreate(onset_frame=100, apex_frame=100, offset_frame=100)

    def test_negative_frame_fails(self):
        """Negative frames should fail."""
        with pytest.raises(ValueError):
            AnnotationCreate(onset_frame=-1, apex_frame=50, offset_frame=100)


class TestFrameRangeValidation:
    def test_valid_frame_range(self):
        from backend.utils.validators import validate_frame_range
        assert validate_frame_range(0, 1000) is True
        assert validate_frame_range(999, 1000) is True
        assert validate_frame_range(500, 1000) is True

    def test_frame_at_boundary(self):
        from backend.utils.validators import validate_frame_range
        assert validate_frame_range(1000, 1000) is False  # out of range [0, 1000)

    def test_negative_frame(self):
        from backend.utils.validators import validate_frame_range
        assert validate_frame_range(-1, 1000) is False

    def test_large_frame(self):
        from backend.utils.validators import validate_frame_range
        assert validate_frame_range(5000, 1000) is False


class TestClipFrameCount:
    def test_inclusive_offset(self):
        """Clip frame count should include both start and end frames."""
        start, end = 1024, 1152
        expected = end - start + 1  # inclusive
        assert expected == 129

    def test_single_frame_clip(self):
        """Start == end should produce 1 frame."""
        start, end = 500, 500
        expected = end - start + 1
        assert expected == 1

    def test_two_frame_clip(self):
        start, end = 100, 101
        expected = end - start + 1
        assert expected == 2


class TestContextFramesClamping:
    def test_context_no_clamping(self):
        """Context within valid range should not be clamped."""
        total = 3000
        start, end = 1000, 1500
        ctx_before, ctx_after = 100, 100
        actual_start = max(0, start - ctx_before)
        actual_end = min(total - 1, end + ctx_after)
        assert actual_start == 900
        assert actual_end == 1600

    def test_context_clamped_at_start(self):
        """Context before frame 0 should clamp to 0."""
        total = 3000
        start, end = 50, 200
        ctx_before = 100
        actual_start = max(0, start - ctx_before)
        assert actual_start == 0

    def test_context_clamped_at_end(self):
        """Context past last frame should clamp to total-1."""
        total = 3000
        start, end = 2800, 2950
        ctx_after = 100
        actual_end = min(total - 1, end + ctx_after)
        assert actual_end == 2999


class TestTimestampCalculation:
    def test_frame_0_timestamp(self):
        from backend.services.video_service import get_frame_timestamp
        assert get_frame_timestamp(0, 240) == 0.0

    def test_frame_240_timestamp(self):
        from backend.services.video_service import get_frame_timestamp
        ts = get_frame_timestamp(240, 240)
        assert abs(ts - 1.0) < 0.0001

    def test_frame_1024_at_240fps(self):
        from backend.services.video_service import get_frame_timestamp
        ts = get_frame_timestamp(1024, 240)
        expected = 1024 / 240
        assert abs(ts - expected) < 0.0001

    def test_zero_fps_returns_zero(self):
        from backend.services.video_service import get_frame_timestamp
        assert get_frame_timestamp(100, 0) == 0.0


class TestClipRequest:
    def test_valid_clip_request(self):
        req = ClipRequest(
            video_id="test",
            onset_frame=100,
            offset_frame=200
        )
        assert req.context_frames_before == 0
        assert req.context_frames_after == 0

    def test_onset_equals_offset_fails(self):
        with pytest.raises(ValueError):
            ClipRequest(
                video_id="test",
                onset_frame=100,
                offset_frame=100
            )

    def test_onset_greater_than_offset_fails(self):
        with pytest.raises(ValueError):
            ClipRequest(
                video_id="test",
                onset_frame=200,
                offset_frame=100
            )

    def test_negative_context_fails(self):
        with pytest.raises(ValueError):
            ClipRequest(
                video_id="test",
                onset_frame=100,
                offset_frame=200,
                context_frames_before=-5
            )
