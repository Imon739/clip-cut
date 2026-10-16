import json
import os
import pytest


EXAMPLE_METADATA_PATH = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), 'example_metadata.json'
)


class TestMetadataSchema:
    @pytest.fixture
    def metadata(self):
        with open(EXAMPLE_METADATA_PATH, 'r') as f:
            return json.load(f)

    def test_required_fields_present(self, metadata):
        """All required top-level fields must exist."""
        required = [
            'participant_id', 'source_video', 'original_fps',
            'original_resolution', 'codec', 'annotation', 'clip',
            'processing_options', 'created_at'
        ]
        for field in required:
            assert field in metadata, f"Missing required field: {field}"

    def test_annotation_fields(self, metadata):
        """Annotation must have onset, apex, offset frames and timestamps."""
        ann = metadata['annotation']
        for key in ['onset_frame', 'apex_frame', 'offset_frame',
                    'onset_timestamp', 'apex_timestamp', 'offset_timestamp']:
            assert key in ann, f"Missing annotation field: {key}"

    def test_clip_fields(self, metadata):
        """Clip must have required fields."""
        clip = metadata['clip']
        for key in ['filename', 'frame_count', 'duration_seconds', 'fps',
                    'offset_inclusive', 'encoding']:
            assert key in clip, f"Missing clip field: {key}"

    def test_resolution_format(self, metadata):
        """Resolution must have positive width and height."""
        res = metadata['original_resolution']
        assert res['width'] > 0
        assert res['height'] > 0
        assert isinstance(res['width'], int)
        assert isinstance(res['height'], int)


class TestMetadataConsistency:
    @pytest.fixture
    def metadata(self):
        with open(EXAMPLE_METADATA_PATH, 'r') as f:
            return json.load(f)

    def test_frame_order(self, metadata):
        """onset < apex < offset in metadata."""
        ann = metadata['annotation']
        assert ann['onset_frame'] < ann['apex_frame'] < ann['offset_frame']

    def test_timestamp_order(self, metadata):
        """Timestamps must follow frame order."""
        ann = metadata['annotation']
        assert ann['onset_timestamp'] < ann['apex_timestamp'] < ann['offset_timestamp']

    def test_timestamp_matches_frame(self, metadata):
        """Timestamps should match frame/fps calculation."""
        fps = metadata['original_fps']
        ann = metadata['annotation']
        
        for label in ['onset', 'apex', 'offset']:
            frame = ann[f'{label}_frame']
            ts = ann[f'{label}_timestamp']
            expected = frame / fps
            assert abs(ts - expected) < 0.001, \
                f"{label} timestamp {ts} doesn't match expected {expected} (frame {frame} / {fps} fps)"

    def test_clip_frame_count_matches(self, metadata):
        """Clip frame count should match onset-to-offset inclusive."""
        ann = metadata['annotation']
        clip = metadata['clip']
        expected_frames = ann['offset_frame'] - ann['onset_frame'] + 1
        assert clip['frame_count'] == expected_frames

    def test_clip_offset_inclusive(self, metadata):
        """Clip must declare inclusive offset."""
        assert metadata['clip']['offset_inclusive'] is True

    def test_fps_positive(self, metadata):
        assert metadata['original_fps'] > 0


class TestEnhancedMapping:
    @pytest.fixture
    def metadata(self):
        with open(EXAMPLE_METADATA_PATH, 'r') as f:
            return json.load(f)

    def test_enhanced_has_disclaimer(self, metadata):
        """Enhanced frames must include disclaimer."""
        enhanced = metadata.get('enhanced_frames', {})
        if enhanced:
            assert 'disclaimer' in enhanced
            assert 'upscal' in enhanced['disclaimer'].lower()

    def test_mapping_references_originals(self, metadata):
        """Enhanced mappings should reference cropped/original files."""
        enhanced = metadata.get('enhanced_frames', {})
        mapping = enhanced.get('mapping', {})
        for enhanced_path, original_path in mapping.items():
            assert 'enhanced' in enhanced_path
            assert ('cropped' in original_path or 'original' in original_path)
