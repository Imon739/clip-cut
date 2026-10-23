# Micro-Expression Video Annotation & Clip Extractor

A locally hosted, high-precision tool designed for computer vision and affective computing researchers preparing micro-expression datasets. Annotate onset, apex, and offset frames with frame-accurate precision, preview facial region-of-interest (ROI) crops, and export research-grade clips accompanied by comprehensive machine-readable metadata.

---

![clipora](clipora.png)

## Features

- **Frame-Accurate Video Scrubbing & Playback**: Navigate video streams frame-by-frame with zero frame-drift, sub-second timeline scrubbing, and variable playback speeds (0.1x to 2.0x).
- **Three-Point Micro-Expression Annotation**: Mark and adjust Onset, Apex, and Offset keyframes with strict logical validation (`onset < apex < offset`).
- **Facial Region-of-Interest (ROI) Cropping**:
  - Automated face detection using MediaPipe Face Mesh / Detection.
  - Crop presets for Full Face, Upper Face (eyes/brows), Lower Face (mouth/jaw), or custom bounding boxes.
- **Visual-Lossless Clip Extraction**:
  - Inclusive offset trimming (`frame_count = offset - onset + 1`).
  - H.264 visually lossless re-encoding (`CRF 10`, `preset=slow`) ensuring precise frame timing and GOP boundary independence.
  - Optional pre- and post-context frames.
- **Keyframe Image Export**: Export uncompressed full-frame and cropped PNGs for onset, apex, and offset frames.
- **Machine-Readable Metadata**: Complete JSON export documenting participant ID, video parameters, frame indices, physical timestamps, crop coordinates, and extraction parameters.
- **Optional Super-Resolution Integration**: Hook into Real-ESRGAN / GFPGAN super-resolution models with mandatory scientific provenance disclaimers.
- **100% Local Execution**: All processing, video files, frames, and metadata stay on your local machine to preserve research participant privacy.

---

## Usage Guide

1. **Upload / Select Video**:
   - Drag and drop your high-speed or standard video file (`.mp4`, `.avi`, `.mov`, `.mkv`).
   - The tool inspects container metadata (total frame count, FPS, native resolution, codec).
2. **Scrub & Identify Expression Boundaries**:
   - Use the timeline slider, video player controls, or keyboard shortcuts to locate the fleeting expression.
   - Use step-by-step frame advancement (`[` / `]` or <kbd>←</kbd> / <kbd>→</kbd>) to inspect minute muscle activations.
3. **Set Keyframes**:
   - **Onset**: Mark the exact frame where facial muscle movement begins.
   - **Apex**: Mark the frame where the expression intensity peaks.
   - **Offset**: Mark the frame where facial muscles return to baseline or neutral state.
4. **Configure Facial ROI Crop**:
   - Enable Auto Face Crop to use MediaPipe facial landmark tracking.
   - Alternatively, drag and resize the bounding box on the video overlay to define a custom region.
5. **Adjust Context & Export Parameters**:
   - Specify optional context frames before Onset and after Offset (default: 0).
   - Configure frame image export format (PNG recommended for losslessness).
6. **Extract & Save**:
   - Click **Extract Clip & Frames**.
   - Review extracted keyframe previews and verify the output package.
   - Access saved clips, frame dumps, and metadata in the `data/` export directory.

---

## Keyboard Shortcuts

| Shortcut | Action | Description |
| :--- | :--- | :--- |
| <kbd>Space</kbd> | **Play / Pause** | Toggle video playback |
| <kbd>←</kbd> / <kbd>→</kbd> | **Step 1 Frame** | Step backward or forward by exactly 1 frame |
| <kbd>Shift</kbd> + <kbd>←</kbd> / <kbd>→</kbd> | **Step 5 Frames** | Step backward or forward by 5 frames |
| <kbd>Ctrl</kbd> + <kbd>←</kbd> / <kbd>→</kbd> | **Step 30 Frames** | Jump backward or forward by 30 frames |
| <kbd>I</kbd> | **Set Onset** | Mark the current frame as Onset |
| <kbd>A</kbd> | **Set Apex** | Mark the current frame as Apex |
| <kbd>O</kbd> | **Set Offset** | Mark the current frame as Offset |
| <kbd>[</kbd> | **Jump to Onset** | Seek player directly to Onset frame |
| <kbd>P</kbd> | **Jump to Apex** | Seek player directly to Apex frame |
| <kbd>]</kbd> | **Jump to Offset** | Seek player directly to Offset frame |
| <kbd>L</kbd> | **Loop Clip** | Loop playback between Onset and Offset |
| <kbd>+</kbd> / <kbd>-</kbd> | **Speed Adjustment** | Increase / decrease playback speed |

---

### Metadata Format (`metadata.json`)

The generated JSON file records all parameters:

- **Participant & Video Source**: Video name, participant ID, native resolution, original container FPS, codec.
- **Annotation**: Exact frame indices and floating-point timestamps for onset, apex, and offset.
- **Clip Specification**: Inclusive frame count, duration in seconds, re-encoding parameters, context frames.
- **Crop Information**: Bounding box coordinates `(x, y, width, height)` and detection preset used.
- **Asset Paths**: Relative paths to original frames, cropped frames, and enhanced frames.
- **Scientific Audit Disclaimers**: Explicit notice regarding any AI-upscaling modifications.

---

## Clip Extraction Details

Standard video editing tools often trim video streams using stream-copying (`-c copy`), which cuts only on intra-coded I-frames (keyframe boundaries). In micro-expression datasets, this leads to temporal drift of several dozen frames.

To guarantee scientific rigor:
1. **Inclusive Offset**: The extracted clip strictly includes both boundary frames:
   $$\text{Frame Count} = \text{Offset Frame} - \text{Onset Frame} + 1$$
2. **Visually Lossless Re-encoding**: Clips are re-encoded using `libx264` with Constant Rate Factor `CRF 10`:
   ```bash
   ffmpeg -ss <timestamp> -i <source> -frames:v <count> -c:v libx264 -crf 10 -preset slow -pix_fmt yuv420p output.mp4
   ```
   This ensures:
   - Absolute frame-to-timestamp correlation starting at frame 0 of the clip.
   - Preservation of high-frequency micro-textural cues and skin deformations.
   - GOP (Group of Pictures) structure rebuilt cleanly for cross-platform neural network decoders (PyTorch `torchvision.io`, OpenCV, Decord).

---

## Optional Super-Resolution Setup

For low-resolution recordings, the tool supports AI-based face super-resolution (e.g., Real-ESRGAN or GFPGAN).

1. Install optional super-resolution packages:
   ```bash
   pip install realesrgan facexlib
   ```
2. Enable the **Enhance Frames** toggle in the user interface.
3. **Scientific Integrity Notice**:
   Whenever super-resolution is applied, the output metadata automatically embeds a mandatory disclaimer:
   > *"AI-upscaled images. Upscaling does not recover real details absent from the original recording."*
   Original un-enhanced frames are always preserved alongside enhanced versions.

---

## Privacy & Ethical Compliance

- **Zero Cloud Dependence**: All video decoding, face detection, crop extraction, and storage are executed strictly within the local host environment (`127.0.0.1`).
- **Data Protection**: Designed to comply with Institutional Review Board (IRB), HIPAA, and GDPR participant confidentiality requirements. No biometric data or video streams are ever transmitted over external networks.

---

## Troubleshooting

- **FFmpeg not detected**: Ensure `ffmpeg` is accessible in your system terminal. Run `ffmpeg -version`. If recently added to `PATH`, restart the active terminal or restart your IDE.
- **Variable Frame Rate (VFR) Drift**: Videos captured on mobile devices or webcams may have variable frame rates. Convert VFR videos to Constant Frame Rate (CFR) before annotation:
  ```bash
  ffmpeg -i input.mp4 -vsync cfr -r 240 output_cfr.mp4
  ```
- **MediaPipe Initialization on Headless Systems**: The tool utilizes `opencv-python-headless` and standard MediaPipe vision solutions. If face detection fails, ensure lighting is adequate or use manual box selection.

---

## Technical Notes

- **Backend**: FastAPI, Uvicorn, OpenCV (`opencv-python-headless`), MediaPipe, NumPy, Pillow, Pydantic v2.
- **Frontend**: Clean vanilla JavaScript/HTML5 UI optimized for high-performance canvas rendering and keyboard responsiveness.
- **Testing**: Built-in test suite covering validation, schemas, and API routes via `pytest`. Run tests with:
  ```bash
  pytest tests/
  ```

---

## License

This project is licensed under the [MIT License](LICENSE).
