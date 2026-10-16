import pytest
from fastapi.testclient import TestClient
from backend.main import app


client = TestClient(app)


class TestVideoEndpoints:
    def test_upload_invalid_extension(self):
        """Uploading a non-video file should return 400."""
        import io
        fake_file = io.BytesIO(b"not a video")
        response = client.post(
            "/api/videos/upload",
            files={"file": ("test.txt", fake_file, "text/plain")}
        )
        assert response.status_code == 400
        assert "Invalid file type" in response.json()["detail"]

    def test_upload_empty_file(self):
        """Uploading an empty file should return 400."""
        import io
        empty_file = io.BytesIO(b"")
        response = client.post(
            "/api/videos/upload",
            files={"file": ("test.mp4", empty_file, "video/mp4")}
        )
        assert response.status_code == 400

    def test_get_nonexistent_video(self):
        """Getting a non-existent video should return 404."""
        response = client.get("/api/videos/nonexistent-id/info")
        assert response.status_code == 404

    def test_get_frame_nonexistent_video(self):
        """Getting a frame from non-existent video should return 404."""
        response = client.get("/api/videos/nonexistent-id/frame/0")
        assert response.status_code == 404

    def test_stream_nonexistent_video(self):
        """Streaming a non-existent video should return 404."""
        response = client.get("/api/videos/nonexistent-id/stream")
        assert response.status_code == 404

    def test_convert_preview_nonexistent_video(self):
        """Transcoding preview of non-existent video should return 404."""
        response = client.post("/api/videos/nonexistent-id/convert-preview")
        assert response.status_code == 404

    def test_list_videos(self):
        """Listing videos should return a list."""
        response = client.get("/api/videos")
        assert response.status_code == 200
        assert isinstance(response.json(), list)


class TestAnnotationEndpoints:
    def test_annotation_nonexistent_video(self):
        """Getting annotation for non-existent video should return 404."""
        response = client.get("/api/annotations/nonexistent-id")
        assert response.status_code == 404

    def test_annotation_order_validation(self):
        """onset > apex should return 422 (validation error)."""
        response = client.post(
            "/api/annotations/some-video-id",
            json={
                "onset_frame": 200,
                "apex_frame": 100,
                "offset_frame": 300
            }
        )
        # Pydantic validation returns 422
        assert response.status_code == 422


class TestClipEndpoints:
    def test_clip_nonexistent(self):
        """Getting non-existent clip should return 404."""
        response = client.get("/api/clips/nonexistent-id/info")
        assert response.status_code == 404

    def test_clip_download_nonexistent(self):
        """Downloading non-existent clip should return 404."""
        response = client.get("/api/clips/nonexistent-id/download")
        assert response.status_code == 404


class TestEnhancementEndpoints:
    def test_enhance_status(self):
        """Enhancement status should always return valid response."""
        response = client.get("/api/enhance/status")
        assert response.status_code == 200
        data = response.json()
        assert 'available' in data
        assert isinstance(data['available'], bool)


class TestFrontend:
    def test_serve_frontend(self):
        """Root should serve the frontend page."""
        response = client.get("/")
        assert response.status_code == 200
