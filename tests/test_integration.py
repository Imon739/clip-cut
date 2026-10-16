import os
import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


@pytest.fixture(scope="session")
def sample_video_path(tmp_path_factory):
    """Generate a small synthetic 240 FPS video with frame numbers drawn on each frame."""
    temp_dir = tmp_path_factory.mktemp("videos")
    video_path = str(temp_dir / "synthetic_240fps.mp4")

    width, height = 640, 480
    fps = 240.0
    num_frames = 100

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(video_path, fourcc, fps, (width, height))

    for i in range(num_frames):
        frame = np.zeros((height, width, 3), dtype=np.uint8)
        frame[:, :] = (30, (i * 2) % 255, 120)
        cv2.circle(frame, (320, 240), 80, (200, 200, 255), -1)
        cv2.circle(frame, (290, 220), 10, (50, 50, 50), -1)
        cv2.circle(frame, (350, 220), 10, (50, 50, 50), -1)
        cv2.ellipse(frame, (320, 270), (30, 15), 0, 0, 180, (50, 50, 150), -1)
        cv2.putText(
            frame, f"Frame {i}", (50, 50),
            cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2
        )
        out.write(frame)

    out.release()
    assert os.path.exists(video_path)
    return video_path


@pytest.fixture(scope="session")
def second_video_path(tmp_path_factory):
    """Generate a second distinct synthetic video to test state clearing."""
    temp_dir = tmp_path_factory.mktemp("videos2")
    video_path = str(temp_dir / "second_240fps.mp4")

    width, height = 320, 240
    fps = 240.0
    num_frames = 50

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(video_path, fourcc, fps, (width, height))

    for i in range(num_frames):
        frame = np.full((height, width, 3), (120, 40, i * 4 % 255), dtype=np.uint8)
        out.write(frame)

    out.release()
    assert os.path.exists(video_path)
    return video_path


class TestEndToEndWorkflow:
    def test_complete_researcher_workflow(self, sample_video_path, second_video_path):
        """
        Test full workflow according to requirements:
        1. Upload valid MP4.
        2. Confirm original video plays continuously (stream endpoint 200).
        3. Confirm seeking works (HTTP Range requests return 206 Partial Content, invalid range returns 416).
        4. Confirm duration and source FPS (240 FPS) are reported correctly.
        5. Navigate between exact source frames (OpenCV extraction).
        6. Set onset, apex, and offset with validation.
        7. Extract a short clip and verify its exact inclusive frame boundaries.
        8. Upload a second video and confirm state separation and clearing.
        9. Test preview conversion endpoint.
        10. Verify that frame inspector still works without breaking the video player.
        """
        # 1. Upload video
        with open(sample_video_path, "rb") as f:
            upload_resp = client.post(
                "/api/videos/upload",
                files={"file": ("sample_240fps.mp4", f, "video/mp4")}
            )
        assert upload_resp.status_code == 200
        video_info = upload_resp.json()
        video_id = video_info["id"]
        assert video_info["total_frames"] == 100
        assert video_info["fps"] == 240.0
        assert video_info["width"] == 640
        assert video_info["height"] == 480
        assert "stream_url" in video_info
        assert video_info["stream_url"] == f"/api/videos/{video_id}/stream"

        # 2. Continuous Video Playback Streaming (HTTP 200 with Accept-Ranges)
        stream_resp = client.get(f"/api/videos/{video_id}/stream")
        assert stream_resp.status_code == 200
        assert stream_resp.headers["accept-ranges"] == "bytes"
        assert "content-length" in stream_resp.headers
        total_file_size = int(stream_resp.headers["content-length"])
        assert total_file_size > 0
        assert "video/" in stream_resp.headers["content-type"]

        # 3. HTTP Range Requests & Seeking (206 Partial Content)
        # Test initial range (e.g. browser buffering first 1KB)
        range_resp = client.get(
            f"/api/videos/{video_id}/stream",
            headers={"Range": "bytes=0-1023"}
        )
        assert range_resp.status_code == 206
        assert range_resp.headers["content-range"] == f"bytes 0-1023/{total_file_size}"
        assert range_resp.headers["content-length"] == "1024"
        assert len(range_resp.content) == 1024

        # Test middle seeking (e.g. browser user jumps to middle)
        seek_resp = client.get(
            f"/api/videos/{video_id}/stream",
            headers={"Range": "bytes=2048-4095"}
        )
        assert seek_resp.status_code == 206
        assert seek_resp.headers["content-range"] == f"bytes 2048-4095/{total_file_size}"
        assert seek_resp.headers["content-length"] == "2048"

        # Test open-ended seeking (e.g. bytes=2048-)
        open_seek_resp = client.get(
            f"/api/videos/{video_id}/stream",
            headers={"Range": "bytes=2048-"}
        )
        assert open_seek_resp.status_code == 206
        expected_len = total_file_size - 2048
        assert open_seek_resp.headers["content-range"] == f"bytes 2048-{total_file_size - 1}/{total_file_size}"
        assert open_seek_resp.headers["content-length"] == str(expected_len)

        # Test invalid out-of-range request (416 Range Not Satisfiable)
        invalid_range_resp = client.get(
            f"/api/videos/{video_id}/stream",
            headers={"Range": f"bytes={total_file_size + 1000}-"}
        )
        assert invalid_range_resp.status_code == 416
        assert invalid_range_resp.headers["content-range"] == f"bytes */{total_file_size}"

        # 4. Confirm duration and 240 FPS metadata
        expected_duration = 100 / 240.0
        assert abs(video_info["duration"] - expected_duration) < 0.01

        # 5. Frame Inspector exact source frame navigation (Frame 0 and Frame 25)
        frame0_resp = client.get(f"/api/videos/{video_id}/frame/0")
        assert frame0_resp.status_code == 200
        assert frame0_resp.headers["content-type"] == "image/jpeg"
        assert len(frame0_resp.content) > 0

        frame25_resp = client.get(f"/api/videos/{video_id}/frame/25")
        assert frame25_resp.status_code == 200
        assert frame25_resp.headers["content-type"] == "image/jpeg"
        # Frames should not be identical
        assert frame0_resp.content != frame25_resp.content

        # Thumbnail retrieval
        thumb_resp = client.get(f"/api/videos/{video_id}/thumbnail/25")
        assert thumb_resp.status_code == 200
        assert thumb_resp.headers["content-type"] == "image/jpeg"

        # 6. Annotation: Onset=20, Apex=45, Offset=70
        onset, apex, offset = 20, 45, 70
        ann_resp = client.post(
            f"/api/annotations/{video_id}",
            json={
                "onset_frame": onset,
                "apex_frame": apex,
                "offset_frame": offset
            }
        )
        assert ann_resp.status_code == 200
        ann_data = ann_resp.json()
        assert ann_data["onset_frame"] == onset
        assert ann_data["apex_frame"] == apex
        assert ann_data["offset_frame"] == offset
        assert abs(ann_data["onset_time"] - (onset / 240.0)) < 0.001

        # 7. Clip Extraction (inclusive offset: frames 20 through 70 = 51 frames)
        clip_resp = client.post(
            "/api/clips/extract",
            json={
                "video_id": video_id,
                "onset_frame": onset,
                "offset_frame": offset,
                "context_frames_before": 0,
                "context_frames_after": 0,
                "participant_id": "test_p01",
                "video_label": "trial_01"
            }
        )
        assert clip_resp.status_code == 200
        clip_info = clip_resp.json()
        clip_id = clip_info["clip_id"]
        expected_frames = offset - onset + 1  # 51 frames
        assert clip_info["frame_count"] == expected_frames
        assert clip_info["offset_inclusive"] is True
        assert os.path.exists(clip_info["filepath"])

        # Preview clip
        preview_resp = client.get(f"/api/clips/{clip_id}/preview")
        assert preview_resp.status_code == 200
        assert preview_resp.headers["content-type"] == "video/mp4"

        # Download clip
        download_resp = client.get(f"/api/clips/{clip_id}/download")
        assert download_resp.status_code == 200

        # 8. Crop face region
        crop_resp = client.post(
            "/api/crop/apply",
            json={
                "video_id": video_id,
                "frame_number": apex,
                "x": 240,
                "y": 160,
                "width": 160,
                "height": 160,
                "participant_id": "test_p01",
                "video_label": "trial_01",
                "format": "png"
            }
        )
        assert crop_resp.status_code == 200
        crop_data = crop_resp.json()
        assert os.path.exists(crop_data["cropped_path"])
        assert os.path.exists(crop_data["original_path"])

        # 9. Full dataset export
        full_export_resp = client.post(
            "/api/export/full",
            json={
                "video_id": video_id,
                "participant_id": "test_p01",
                "video_label": "trial_01",
                "export_original_frames": True,
                "export_cropped_frames": True,
                "export_clip": True,
                "export_metadata": True,
                "crop_box": {"x": 240, "y": 160, "width": 160, "height": 160},
                "annotations": {
                    "onset_frame": onset,
                    "apex_frame": apex,
                    "offset_frame": offset
                }
            }
        )
        assert full_export_resp.status_code == 200
        export_summary = full_export_resp.json()
        assert export_summary["success"] is True
        assert os.path.isdir(export_summary["export_dir"])
        assert os.path.exists(os.path.join(export_summary["export_dir"], "metadata.json"))

        # 10. Upload second video and verify state independence & clearing
        with open(second_video_path, "rb") as f2:
            upload2_resp = client.post(
                "/api/videos/upload",
                files={"file": ("second_240fps.mp4", f2, "video/mp4")}
            )
        assert upload2_resp.status_code == 200
        v2_info = upload2_resp.json()
        v2_id = v2_info["id"]
        assert v2_id != video_id
        assert v2_info["total_frames"] == 50
        assert v2_info["width"] == 320
        assert v2_info["height"] == 240

        # Video 2 has its own streaming endpoint
        v2_stream_resp = client.get(f"/api/videos/{v2_id}/stream")
        assert v2_stream_resp.status_code == 200

        # Video 2 initially has no annotation
        v2_ann_resp = client.get(f"/api/annotations/{v2_id}")
        assert v2_ann_resp.status_code == 404
