/**
 * Micro-Expression Video Annotation & Clip Extractor
 * File 4: frontend/js/video-player.js
 * Synchronized Video Player (Continuous HTML5 Video) and Frame Inspector (Exact OpenCV Source Frames)
 */

class VideoPlayer {
  /**
   * @param {string|HTMLCanvasElement} canvasTarget - Canvas element or ID
   * @param {App} app - Main app instance reference
   */
  constructor(canvasTarget, app) {
    this.app = app;
    this.canvas = typeof canvasTarget === 'string' ? document.getElementById(canvasTarget) : canvasTarget;
    this.ctx = this.canvas ? this.canvas.getContext('2d', { alpha: false }) : null;
    this.videoEl = document.getElementById('videoPlayer');

    // Video metadata
    this.videoId = null;
    this.totalFrames = 0;
    this.fps = 240.0;
    this.videoWidth = 720;
    this.videoHeight = 480;
    this.streamUrl = null;

    // Viewport state
    this.currentFrame = 0;
    this.currentImage = null;
    this.renderBounds = { x: 0, y: 0, width: 720, height: 480 };
    this.viewMode = 'split'; // 'split' | 'video' | 'inspector'
    this.isPlaying = false;

    // LRU Frame Cache for Frame Inspector (~60 frames)
    this.cache = new Map();
    this.maxCacheSize = 60;
    this.preloadingSet = new Set();
    this.activeFetchController = null;
    this.activeRequestId = 0;

    // DOM Elements
    this.dom = {
      prevBtn: document.getElementById('prevFrameBtn'),
      nextBtn: document.getElementById('nextFrameBtn'),
      jumpBack100Btn: document.getElementById('jumpBack100Btn'),
      jumpBack10Btn: document.getElementById('jumpBack10Btn'),
      jumpFwd10Btn: document.getElementById('jumpFwd10Btn'),
      jumpFwd100Btn: document.getElementById('jumpFwd100Btn'),
      playPauseBtn: document.getElementById('playPauseBtn'),
      playIcon: document.getElementById('playIcon'),
      pauseIcon: document.getElementById('pauseIcon'),
      playPauseText: document.getElementById('playPauseText'),
      currentFrameInput: document.getElementById('currentFrameInput'),
      totalFramesDisplay: document.getElementById('totalFramesDisplay'),
      currentTimestampDisplay: document.getElementById('currentTimestampDisplay'),
      loadingOverlay: document.getElementById('frameLoadingOverlay'),
      videoLoadingOverlay: document.getElementById('videoLoadingOverlay'),
      videoErrorOverlay: document.getElementById('videoErrorOverlay'),
      videoErrorMessage: document.getElementById('videoErrorMessage'),
      convertPreviewBtn: document.getElementById('convertPreviewBtn'),
      videoPlaybackTime: document.getElementById('videoPlaybackTime'),
      videoTotalTime: document.getElementById('videoTotalTime'),
      inspectorFrameDisplay: document.getElementById('inspectorFrameDisplay'),
      inspectorFpsBadge: document.getElementById('inspectorFpsBadge'),
      emptyPlaceholder: document.getElementById('emptyVideoPlaceholder'),
      dualContainer: document.getElementById('dualViewportContainer'),
      viewSplitBtn: document.getElementById('viewSplitBtn'),
      viewVideoOnlyBtn: document.getElementById('viewVideoOnlyBtn'),
      viewInspectorOnlyBtn: document.getElementById('viewInspectorOnlyBtn')
    };

    this.bindEvents();
    this.bindVideoEvents();
    this.bindViewModeEvents();
    this.clearCanvas();
  }

  /**
   * Bind player controls and inputs
   */
  bindEvents() {
    // Navigation buttons
    if (this.dom.prevBtn) {
      this.dom.prevBtn.addEventListener('click', () => this.prevFrame());
    }
    if (this.dom.nextBtn) {
      this.dom.nextBtn.addEventListener('click', () => this.nextFrame());
    }
    if (this.dom.jumpBack10Btn) {
      this.dom.jumpBack10Btn.addEventListener('click', () => this.jumpFrames(-10));
    }
    if (this.dom.jumpFwd10Btn) {
      this.dom.jumpFwd10Btn.addEventListener('click', () => this.jumpFrames(10));
    }
    if (this.dom.jumpBack100Btn) {
      this.dom.jumpBack100Btn.addEventListener('click', () => this.jumpFrames(-100));
    }
    if (this.dom.jumpFwd100Btn) {
      this.dom.jumpFwd100Btn.addEventListener('click', () => this.jumpFrames(100));
    }

    // Play / Pause toggle
    if (this.dom.playPauseBtn) {
      this.dom.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
    }

    // Frame direct number input
    if (this.dom.currentFrameInput) {
      this.dom.currentFrameInput.addEventListener('change', (e) => {
        const val = parseInt(e.target.value, 10);
        if (!isNaN(val)) {
          this.goToFrame(val);
        } else {
          e.target.value = this.currentFrame;
        }
      });

      this.dom.currentFrameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.target.blur();
        }
      });
    }

    // Window resize observer to adapt canvas internal resolution to display size
    window.addEventListener('resize', () => {
      this.updateCanvasDimensions();
      if (this.currentImage) {
        this.renderFrame(this.currentImage);
      }
      if (this.app && this.app.cropTool) {
        this.app.cropTool.drawOverlay();
      }
    });
  }

  /**
   * Bind HTML5 Video element events
   */
  bindVideoEvents() {
    if (!this.videoEl) return;

    this.videoEl.addEventListener('loadedmetadata', () => {
      if (this.dom.videoLoadingOverlay) this.dom.videoLoadingOverlay.classList.add('hidden');
      if (this.dom.videoErrorOverlay) this.dom.videoErrorOverlay.classList.add('hidden');
      if (this.dom.emptyPlaceholder) this.dom.emptyPlaceholder.classList.add('hidden');

      if (this.dom.videoTotalTime && this.videoEl.duration) {
        this.dom.videoTotalTime.textContent = this.app.formatDuration(this.videoEl.duration);
      }
    });

    this.videoEl.addEventListener('timeupdate', () => {
      const curTime = this.videoEl.currentTime || 0;
      if (this.dom.videoPlaybackTime) {
        this.dom.videoPlaybackTime.textContent = this.app.formatDuration(curTime);
      }

      // If video is playing, update frame counter & timeline cursor
      if (!this.videoEl.paused) {
        const frame = Math.max(0, Math.min(this.totalFrames - 1, Math.round(curTime * this.fps)));
        this.currentFrame = frame;
        this.updateControlsUI(frame);

        if (this.app) {
          this.app.currentFrame = frame;
          if (this.app.timeline) {
            this.app.timeline.setCursor(frame);
          }
        }
      }
    });

    this.videoEl.addEventListener('play', () => {
      this.setPlayPauseState(true);
    });

    this.videoEl.addEventListener('pause', () => {
      this.setPlayPauseState(false);
      // When paused, sync the exact source frame in the frame inspector
      const curTime = this.videoEl.currentTime || 0;
      const frame = Math.max(0, Math.min(this.totalFrames - 1, Math.round(curTime * this.fps)));
      this.loadFrame(frame);
    });

    this.videoEl.addEventListener('seeked', () => {
      const curTime = this.videoEl.currentTime || 0;
      const frame = Math.max(0, Math.min(this.totalFrames - 1, Math.round(curTime * this.fps)));
      this.loadFrame(frame);
    });

    this.videoEl.addEventListener('waiting', () => {
      if (this.dom.videoLoadingOverlay) {
        this.dom.videoLoadingOverlay.classList.remove('hidden');
      }
    });

    this.videoEl.addEventListener('playing', () => {
      if (this.dom.videoLoadingOverlay) {
        this.dom.videoLoadingOverlay.classList.add('hidden');
      }
    });

    this.videoEl.addEventListener('error', (e) => {
      console.warn('HTML5 Video Error:', e);
      if (this.dom.videoLoadingOverlay) this.dom.videoLoadingOverlay.classList.add('hidden');
      if (this.dom.videoErrorOverlay) {
        this.dom.videoErrorOverlay.classList.remove('hidden');
        if (this.dom.videoErrorMessage) {
          this.dom.videoErrorMessage.textContent =
            'Browser could not decode this video codec directly (e.g., raw AVI or legacy MPEG-4). ' +
            'You can still inspect exact 240 FPS frames on the right, or transcode an H.264 preview.';
        }
        if (this.dom.convertPreviewBtn) {
          this.dom.convertPreviewBtn.classList.remove('hidden');
        }
      }
    });

    if (this.dom.convertPreviewBtn) {
      this.dom.convertPreviewBtn.addEventListener('click', async () => {
        if (!this.videoId) return;
        this.dom.convertPreviewBtn.disabled = true;
        this.dom.convertPreviewBtn.textContent = 'Transcoding Preview with FFmpeg...';
        try {
          const res = await api.convertVideoPreview(this.videoId);
          if (res && res.preview_url) {
            this.app.showSuccess('Preview transcoded! Loading in player...');
            this.videoEl.src = res.preview_url;
            this.videoEl.load();
            if (this.dom.videoErrorOverlay) this.dom.videoErrorOverlay.classList.add('hidden');
          }
        } catch (err) {
          this.app.showError(`Transcoding failed: ${err.message}`);
        } finally {
          this.dom.convertPreviewBtn.disabled = false;
          this.dom.convertPreviewBtn.textContent = 'Transcode Browser Preview (H.264)';
        }
      });
    }
  }

  /**
   * Bind Viewport Mode buttons (Split, Video Only, Inspector Only)
   */
  bindViewModeEvents() {
    if (this.dom.viewSplitBtn) {
      this.dom.viewSplitBtn.addEventListener('click', () => this.setViewMode('split'));
    }
    if (this.dom.viewVideoOnlyBtn) {
      this.dom.viewVideoOnlyBtn.addEventListener('click', () => this.setViewMode('video'));
    }
    if (this.dom.viewInspectorOnlyBtn) {
      this.dom.viewInspectorOnlyBtn.addEventListener('click', () => this.setViewMode('inspector'));
    }
  }

  /**
   * Set display layout mode
   */
  setViewMode(mode) {
    this.viewMode = mode;
    if (this.dom.dualContainer) {
      this.dom.dualContainer.className = `dual-viewport-container mode-${mode}`;
    }
    [this.dom.viewSplitBtn, this.dom.viewVideoOnlyBtn, this.dom.viewInspectorOnlyBtn].forEach(btn => {
      if (btn) btn.classList.remove('active');
    });

    if (mode === 'split' && this.dom.viewSplitBtn) this.dom.viewSplitBtn.classList.add('active');
    if (mode === 'video' && this.dom.viewVideoOnlyBtn) this.dom.viewVideoOnlyBtn.classList.add('active');
    if (mode === 'inspector' && this.dom.viewInspectorOnlyBtn) this.dom.viewInspectorOnlyBtn.classList.add('active');

    setTimeout(() => {
      this.updateCanvasDimensions();
      if (this.currentImage) {
        this.renderFrame(this.currentImage);
      }
      if (this.app && this.app.cropTool) {
        this.app.cropTool.drawOverlay();
      }
    }, 50);
  }

  /**
   * Configure new video source
   */
  setVideo(videoId, totalFrames, fps, width, height, streamUrl) {
    this.videoId = videoId;
    this.totalFrames = totalFrames || 0;
    this.fps = fps || 240.0;
    this.videoWidth = width || 720;
    this.videoHeight = height || 480;
    this.currentFrame = 0;
    this.streamUrl = streamUrl || api.getVideoStreamUrl(videoId);

    // Reset error & loading overlays
    if (this.dom.videoErrorOverlay) this.dom.videoErrorOverlay.classList.add('hidden');
    if (this.dom.emptyPlaceholder) this.dom.emptyPlaceholder.classList.add('hidden');
    if (this.dom.videoLoadingOverlay) this.dom.videoLoadingOverlay.classList.remove('hidden');

    // Update HTML5 Video Player source with HTTP 206 streaming URL
    if (this.videoEl) {
      this.videoEl.pause();
      this.videoEl.src = this.streamUrl;
      this.videoEl.load();
    }

    // Reset LRU cache
    this.cache.clear();
    this.preloadingSet.clear();
    if (this.app) {
      this.app.setCacheStatus(0);
    }

    // Update inspector badges
    if (this.dom.inspectorFpsBadge) {
      this.dom.inspectorFpsBadge.textContent = `${Math.round(this.fps)} FPS`;
    }
    if (this.dom.inspectorFrameDisplay) {
      this.dom.inspectorFrameDisplay.textContent = '0';
    }

    this.updateCanvasDimensions();

    // Enable navigation controls
    const hasFrames = this.totalFrames > 0;
    [
      this.dom.prevBtn,
      this.dom.nextBtn,
      this.dom.jumpBack100Btn,
      this.dom.jumpBack10Btn,
      this.dom.jumpFwd10Btn,
      this.dom.jumpFwd100Btn,
      this.dom.playPauseBtn,
      this.dom.currentFrameInput
    ].forEach(el => {
      if (el) el.disabled = !hasFrames;
    });

    if (this.dom.totalFramesDisplay) {
      this.dom.totalFramesDisplay.textContent = Math.max(0, this.totalFrames - 1);
    }
    if (this.dom.currentFrameInput) {
      this.dom.currentFrameInput.max = Math.max(0, this.totalFrames - 1);
      this.dom.currentFrameInput.min = 0;
      this.dom.currentFrameInput.value = 0;
    }

    // Load initial frame 0 in Frame Inspector
    if (hasFrames) {
      this.loadFrame(0);
    }
  }

  /**
   * Set canvas width/height to match container while keeping aspect ratio
   */
  updateCanvasDimensions() {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement;
    if (!parent) return;

    const parentWidth = parent.clientWidth || 720;
    const parentHeight = parent.clientHeight || 480;

    // Set internal resolution matching client dimension
    this.canvas.width = parentWidth;
    this.canvas.height = parentHeight;

    // Calculate letterboxing / pillarboxing for video frame inside canvas
    const videoAspect = (this.videoWidth || 720) / (this.videoHeight || 480);
    const canvasAspect = parentWidth / parentHeight;

    let renderW, renderH, renderX, renderY;

    if (canvasAspect > videoAspect) {
      renderH = parentHeight;
      renderW = renderH * videoAspect;
      renderX = (parentWidth - renderW) / 2;
      renderY = 0;
    } else {
      renderW = parentWidth;
      renderH = renderW / videoAspect;
      renderX = 0;
      renderY = (parentHeight - renderH) / 2;
    }

    this.renderBounds = {
      x: renderX,
      y: renderY,
      width: renderW,
      height: renderH
    };

    // Keep crop canvas in sync
    const cropCanvas = document.getElementById('cropCanvas');
    if (cropCanvas) {
      cropCanvas.width = parentWidth;
      cropCanvas.height = parentHeight;
    }
  }

  /**
   * Clear canvas with neutral dark background
   */
  clearCanvas() {
    if (!this.ctx || !this.canvas) return;
    this.ctx.fillStyle = '#0a0f1d';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Load and render specific source frame in Frame Inspector
   */
  async loadFrame(frameNumber) {
    if (!this.videoId || this.totalFrames <= 0) return;

    // Clamp frame to range [0, totalFrames - 1]
    const clampedFrame = Math.max(0, Math.min(frameNumber, this.totalFrames - 1));
    this.currentFrame = clampedFrame;

    this.updateControlsUI(clampedFrame);

    // Notify app controller
    if (this.app) {
      this.app.onFrameChanged(clampedFrame);
    }

    // Check if in LRU Cache
    if (this.cache.has(clampedFrame)) {
      const cachedImg = this.cache.get(clampedFrame);
      this.cache.delete(clampedFrame);
      this.cache.set(clampedFrame, cachedImg);

      this.currentImage = cachedImg;
      this.renderFrame(cachedImg);
      this.hideLoading();
      this.triggerAdjacentPreload(clampedFrame);
      return;
    }

    // Frame not cached: fetch from API
    const requestId = ++this.activeRequestId;

    const loadingTimer = setTimeout(() => {
      if (this.activeRequestId === requestId) {
        this.showLoading();
      }
    }, 60);

    try {
      const frameUrl = api.getFrameUrl(this.videoId, clampedFrame);
      const img = await this.loadImage(frameUrl);

      clearTimeout(loadingTimer);

      if (this.activeRequestId === requestId) {
        this.hideLoading();
        this.currentImage = img;
        this.addToCache(clampedFrame, img);
        this.renderFrame(img);
        this.triggerAdjacentPreload(clampedFrame);
      }
    } catch (err) {
      clearTimeout(loadingTimer);
      if (this.activeRequestId === requestId) {
        this.hideLoading();
        console.warn(`Error loading frame ${clampedFrame}:`, err);
        this.drawErrorFrame(clampedFrame, err.message);
      }
    }
  }

  /**
   * Render decoded image on canvas with letterbox scaling
   */
  renderFrame(img) {
    if (!this.ctx || !this.canvas || !img) return;

    this.ctx.fillStyle = '#0a0f1d';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const b = this.renderBounds;
    this.ctx.drawImage(img, b.x, b.y, b.width, b.height);
  }

  /**
   * Draw error placeholder when frame fails to load
   */
  drawErrorFrame(frameNumber, message) {
    if (!this.ctx || !this.canvas) return;
    this.ctx.fillStyle = '#16213e';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.fillStyle = '#e94560';
    this.ctx.font = '14px JetBrains Mono, monospace';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(`Frame ${frameNumber} Unavailable`, this.canvas.width / 2, this.canvas.height / 2 - 10);

    this.ctx.fillStyle = '#94a3b8';
    this.ctx.font = '12px Inter, sans-serif';
    this.ctx.fillText(message || 'Failed to fetch from backend', this.canvas.width / 2, this.canvas.height / 2 + 15);
  }

  /**
   * Add decoded frame to LRU Cache
   */
  addToCache(frameNumber, img) {
    if (this.cache.has(frameNumber)) {
      this.cache.delete(frameNumber);
    } else if (this.cache.size >= this.maxCacheSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(frameNumber, img);

    if (this.app) {
      this.app.setCacheStatus(this.cache.size);
    }
  }

  /**
   * Preload adjacent frames in background (±5 frames)
   */
  triggerAdjacentPreload(centerFrame) {
    if (!this.videoId || this.totalFrames <= 0) return;

    const lookAhead = 5;
    const framesToPreload = [];

    for (let i = 1; i <= lookAhead; i++) {
      const fForward = centerFrame + i;
      if (fForward < this.totalFrames && !this.cache.has(fForward) && !this.preloadingSet.has(fForward)) {
        framesToPreload.push(fForward);
      }
      const fBackward = centerFrame - i;
      if (fBackward >= 0 && !this.cache.has(fBackward) && !this.preloadingSet.has(fBackward)) {
        framesToPreload.push(fBackward);
      }
    }

    framesToPreload.forEach(frame => {
      this.preloadingSet.add(frame);
      const url = api.getFrameUrl(this.videoId, frame);

      this.loadImage(url)
        .then(img => {
          this.addToCache(frame, img);
        })
        .catch(() => {})
        .finally(() => {
          this.preloadingSet.delete(frame);
        });
    });
  }

  /**
   * Asynchronously load an image URL into HTMLImageElement
   */
  loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image from ' + src));
      img.src = src;
    });
  }

  /**
   * Update frame navigation UI values
   */
  updateControlsUI(frameNumber) {
    if (this.dom.currentFrameInput && document.activeElement !== this.dom.currentFrameInput) {
      this.dom.currentFrameInput.value = frameNumber;
    }

    if (this.dom.currentTimestampDisplay && this.app) {
      this.dom.currentTimestampDisplay.textContent = this.app.formatTimestamp(frameNumber, this.fps);
    }

    if (this.dom.inspectorFrameDisplay) {
      this.dom.inspectorFrameDisplay.textContent = frameNumber;
    }

    if (this.dom.prevBtn) {
      this.dom.prevBtn.disabled = frameNumber <= 0;
    }
    if (this.dom.nextBtn) {
      this.dom.nextBtn.disabled = frameNumber >= this.totalFrames - 1;
    }
  }

  /**
   * Frame navigation methods
   */
  nextFrame() {
    this.goToFrame(this.currentFrame + 1);
  }

  prevFrame() {
    this.goToFrame(this.currentFrame - 1);
  }

  jumpFrames(n) {
    this.goToFrame(this.currentFrame + n);
  }

  goToFrame(n, syncVideo = true) {
    const target = Math.max(0, Math.min(n, this.totalFrames - 1));
    this.currentFrame = target;

    // Sync HTML5 video player timestamp if video is loaded
    if (syncVideo && this.videoEl && !isNaN(this.videoEl.duration) && this.videoEl.duration > 0) {
      const targetTime = target / (this.fps || 240);
      if (Math.abs(this.videoEl.currentTime - targetTime) > 0.005) {
        this.videoEl.currentTime = targetTime;
      }
    }

    this.loadFrame(target);
  }

  /**
   * Toggle continuous HTML5 video playback
   */
  togglePlayPause() {
    if (!this.videoEl || !this.videoId) return;
    if (this.videoEl.paused) {
      this.videoEl.play().catch(err => {
        console.warn('Playback play failed:', err);
      });
    } else {
      this.videoEl.pause();
    }
  }

  setPlayPauseState(playing) {
    this.isPlaying = playing;
    if (this.dom.playIcon && this.dom.pauseIcon) {
      if (playing) {
        this.dom.playIcon.classList.add('hidden');
        this.dom.pauseIcon.classList.remove('hidden');
      } else {
        this.dom.playIcon.classList.remove('hidden');
        this.dom.pauseIcon.classList.add('hidden');
      }
    }
    if (this.dom.playPauseText) {
      this.dom.playPauseText.textContent = playing ? 'Pause' : 'Play';
    }
  }

  showLoading() {
    if (this.dom.loadingOverlay) {
      this.dom.loadingOverlay.classList.remove('hidden');
    }
  }

  hideLoading() {
    if (this.dom.loadingOverlay) {
      this.dom.loadingOverlay.classList.add('hidden');
    }
  }

  /**
   * Coordinate transformation utilities for Crop Tool
   */
  canvasToVideoCoords(canvasX, canvasY) {
    const b = this.renderBounds;
    const normX = (canvasX - b.x) / b.width;
    const normY = (canvasY - b.y) / b.height;

    const vidX = Math.round(normX * (this.videoWidth || 720));
    const vidY = Math.round(normY * (this.videoHeight || 480));

    return {
      x: Math.max(0, Math.min(vidX, this.videoWidth)),
      y: Math.max(0, Math.min(vidY, this.videoHeight))
    };
  }

  videoToCanvasCoords(videoX, videoY) {
    const b = this.renderBounds;
    const normX = videoX / (this.videoWidth || 720);
    const normY = videoY / (this.videoHeight || 480);

    return {
      x: b.x + normX * b.width,
      y: b.y + normY * b.height
    };
  }
}

// Global attachment
window.VideoPlayer = VideoPlayer;
