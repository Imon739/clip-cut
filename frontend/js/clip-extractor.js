/**
 * Micro-Expression Video Annotation & Clip Extractor
 * File 7: frontend/js/clip-extractor.js
 * Lossless Temporal Video Segment Extractor with Video Preview & Context Frames
 */

class ClipExtractor {
  /**
   * @param {App} app - Main app instance reference
   */
  constructor(app) {
    this.app = app;

    // Cache elements
    this.dom = {
      clipRangeText: document.getElementById('clipRangeText'),
      clipContextBefore: document.getElementById('clipContextBefore'),
      clipContextAfter: document.getElementById('clipContextAfter'),
      clipParticipantId: document.getElementById('clipParticipantId'),
      clipVideoLabel: document.getElementById('clipVideoLabel'),
      extractClipBtn: document.getElementById('extractClipBtn'),

      // Progress
      clipExtractionProgress: document.getElementById('clipExtractionProgress'),
      clipProgressStatusText: document.getElementById('clipProgressStatusText'),
      clipProgressBar: document.getElementById('clipProgressBar'),

      // Result & Preview
      clipResultCard: document.getElementById('clipResultCard'),
      clipResultId: document.getElementById('clipResultId'),
      clipPreviewVideo: document.getElementById('clipPreviewVideo'),
      clipMetaFrames: document.getElementById('clipMetaFrames'),
      clipMetaDuration: document.getElementById('clipMetaDuration'),
      clipMetaFps: document.getElementById('clipMetaFps'),
      clipMetaResolution: document.getElementById('clipMetaResolution'),
      downloadClipLink: document.getElementById('downloadClipLink'),
      reextractClipBtn: document.getElementById('reextractClipBtn')
    };

    this.currentClipData = null;
    this.isExtracting = false;

    this.bindEvents();
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    if (this.dom.extractClipBtn) {
      this.dom.extractClipBtn.addEventListener('click', () => this.extractClip());
    }

    if (this.dom.reextractClipBtn) {
      this.dom.reextractClipBtn.addEventListener('click', () => {
        if (this.dom.clipResultCard) {
          this.dom.clipResultCard.classList.add('hidden');
        }
        if (this.dom.extractClipBtn) {
          this.dom.extractClipBtn.scrollIntoView({ behavior: 'smooth' });
        }
      });
    }

    // Recalculate range text when context inputs change
    if (this.dom.clipContextBefore) {
      this.dom.clipContextBefore.addEventListener('input', () => this.updateRangeSummary());
    }
    if (this.dom.clipContextAfter) {
      this.dom.clipContextAfter.addEventListener('input', () => this.updateRangeSummary());
    }
  }

  /**
   * Called when new video is loaded
   */
  onVideoLoaded(info) {
    // Default video label to filename without extension
    if (this.dom.clipVideoLabel && info && info.filename) {
      const cleanName = info.filename.replace(/\.[^/.]+$/, '');
      if (!this.dom.clipVideoLabel.value) {
        this.dom.clipVideoLabel.value = cleanName;
      }
    }

    if (this.dom.clipResultCard) {
      this.dom.clipResultCard.classList.add('hidden');
    }
    if (this.dom.clipPreviewVideo) {
      this.dom.clipPreviewVideo.pause();
      this.dom.clipPreviewVideo.src = '';
    }

    this.syncFromAnnotations();
  }

  /**
   * Sync range status and button enablement from app annotations
   */
  syncFromAnnotations() {
    this.updateRangeSummary();
  }

  /**
   * Update range summary text and extract button disabled state
   */
  updateRangeSummary() {
    const { onset, offset } = this.app.annotation;
    const hasValidRange = onset !== null && offset !== null && onset <= offset;

    const before = Math.max(0, parseInt(this.dom.clipContextBefore ? this.dom.clipContextBefore.value : 0, 10) || 0);
    const after = Math.max(0, parseInt(this.dom.clipContextAfter ? this.dom.clipContextAfter.value : 0, 10) || 0);

    if (hasValidRange) {
      const baseFrames = offset - onset + 1;
      const totalFrames = baseFrames + before + after;
      const fps = this.app.fps || 30.0;
      const durationSec = (totalFrames / fps).toFixed(2);

      const startFrame = Math.max(0, onset - before);
      const endFrame = Math.min((this.app.totalFrames || 100000) - 1, offset + after);

      if (this.dom.clipRangeText) {
        this.dom.clipRangeText.innerHTML = `
          <span>Onset: ${onset} &rarr; Offset: ${offset}</span><br>
          <span style="font-size: 0.85rem; color: #10B981;">Total Extraction: Frames ${startFrame} &rarr; ${endFrame} (${totalFrames} frames, ~${durationSec}s)</span>
        `;
      }

      if (this.dom.extractClipBtn) {
        this.dom.extractClipBtn.disabled = this.isExtracting;
      }
    } else {
      if (this.dom.clipRangeText) {
        this.dom.clipRangeText.textContent = 'Please set valid Onset and Offset points in Annotations tab';
        this.dom.clipRangeText.style.color = '#e94560';
      }

      if (this.dom.extractClipBtn) {
        this.dom.extractClipBtn.disabled = true;
      }
    }
  }

  /**
   * Execute clip extraction API request
   */
  async extractClip() {
    if (!this.app.currentVideoId) {
      this.app.showWarning('No active video loaded.');
      return;
    }

    const { onset, offset } = this.app.annotation;
    if (onset === null || offset === null || onset > offset) {
      this.app.showError('Invalid expression range. Both Onset and Offset must be specified.');
      return;
    }

    const before = Math.max(0, parseInt(this.dom.clipContextBefore.value, 10) || 0);
    const after = Math.max(0, parseInt(this.dom.clipContextAfter.value, 10) || 0);
    const participantId = (this.dom.clipParticipantId.value || '').trim();
    const videoLabel = (this.dom.clipVideoLabel.value || '').trim();

    this.isExtracting = true;
    this.dom.extractClipBtn.disabled = true;

    // Show progress UI
    if (this.dom.clipExtractionProgress) {
      this.dom.clipExtractionProgress.classList.remove('hidden');
    }
    if (this.dom.clipResultCard) {
      this.dom.clipResultCard.classList.add('hidden');
    }

    this.app.setStatus('Extracting lossless temporal clip on backend...', 'working');

    try {
      const payload = {
        video_id: this.app.currentVideoId,
        onset_frame: onset,
        offset_frame: offset,
        context_frames_before: before,
        context_frames_after: after,
        participant_id: participantId,
        video_label: videoLabel
      };

      const result = await api.extractClip(payload);
      this.currentClipData = result;

      // Render clip results
      this.renderClipResult(result);
      this.app.showSuccess('Micro-expression clip extracted successfully!');
      this.app.setStatus('Clip extraction finished.', 'ready');
    } catch (err) {
      console.error('Clip extraction failed:', err);
      this.app.showError(`Clip extraction failed: ${err.message}`);
      this.app.setStatus('Clip extraction failed.', 'error');
    } finally {
      this.isExtracting = false;
      this.dom.extractClipBtn.disabled = false;
      if (this.dom.clipExtractionProgress) {
        this.dom.clipExtractionProgress.classList.add('hidden');
      }
    }
  }

  /**
   * Render extracted clip info and preview
   */
  renderClipResult(clip) {
    if (!clip) return;
    const clipId = clip.id || clip.clip_id || 1;

    if (this.dom.clipResultId) {
      this.dom.clipResultId.textContent = `Clip #${clipId}`;
    }

    // Set video stream preview source
    const previewUrl = api.getClipPreviewUrl(clipId);
    if (this.dom.clipPreviewVideo) {
      this.dom.clipPreviewVideo.src = previewUrl;
      this.dom.clipPreviewVideo.load();
    }

    // Set download link
    const downloadUrl = api.getClipDownloadUrl(clipId);
    if (this.dom.downloadClipLink) {
      this.dom.downloadClipLink.href = downloadUrl;
      this.dom.downloadClipLink.setAttribute('download', clip.filename || `clip_${clipId}.mp4`);
    }

    // Fill metadata grid
    const fps = clip.fps || this.app.fps || 30.0;
    const frameCount = clip.frame_count || clip.total_frames || ((this.app.annotation.offset - this.app.annotation.onset + 1));
    const durationSec = clip.duration !== undefined ? clip.duration : (frameCount / fps);

    if (this.dom.clipMetaFrames) {
      this.dom.clipMetaFrames.textContent = `${frameCount} frames`;
    }
    if (this.dom.clipMetaDuration) {
      this.dom.clipMetaDuration.textContent = this.app.formatDuration(durationSec);
    }
    if (this.dom.clipMetaFps) {
      this.dom.clipMetaFps.textContent = `${Number(fps).toFixed(2)} fps`;
    }
    if (this.dom.clipMetaResolution) {
      this.dom.clipMetaResolution.textContent = clip.width && clip.height ? `${clip.width} × ${clip.height}` : `${this.app.videoPlayer.videoWidth} × ${this.app.videoPlayer.videoHeight}`;
    }

    if (this.dom.clipResultCard) {
      this.dom.clipResultCard.classList.remove('hidden');
    }
  }
}

// Global attachment
window.ClipExtractor = ClipExtractor;
