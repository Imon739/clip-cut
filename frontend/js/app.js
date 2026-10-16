/**
 * Micro-Expression Video Annotation & Clip Extractor
 * File 3: frontend/js/app.js
 * Main Application Controller, API client, and global coordinator.
 */

// Base API configuration
const API_BASE_URL = 'http://127.0.0.1:8000/api';

/**
 * Robust API Client with standard error handling and typed responses
 */
const api = {
  baseUrl: API_BASE_URL,

  /**
   * Helper for standard JSON fetch requests
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = options.headers || {};

    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        let errorMsg = `HTTP Error ${response.status}: ${response.statusText}`;
        try {
          const errorData = await response.json();
          if (errorData && (errorData.detail || errorData.message || errorData.error)) {
            errorMsg = errorData.detail || errorData.message || errorData.error;
          }
        } catch (_) {
          // If not JSON, try text
          try {
            const errorText = await response.text();
            if (errorText) errorMsg = errorText;
          } catch (__) {}
        }
        throw new Error(errorMsg);
      }

      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }
      return response;
    } catch (err) {
      console.error(`API Request Failed: ${endpoint}`, err);
      throw err;
    }
  },

  /**
   * Upload video with progress callback via XMLHttpRequest
   */
  uploadVideo(file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const url = `${this.baseUrl}/videos/upload`;
      const formData = new FormData();
      formData.append('file', file);

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && typeof onProgress === 'function') {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress(percent, e.loaded, e.total);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            resolve(data);
          } catch (e) {
            resolve({ success: true, message: xhr.responseText });
          }
        } else {
          let msg = `Upload failed with status ${xhr.status}`;
          try {
            const errObj = JSON.parse(xhr.responseText);
            msg = errObj.detail || errObj.message || msg;
          } catch (_) {}
          reject(new Error(msg));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Network error during video upload. Please ensure backend is running at ' + this.baseUrl));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Video upload was cancelled.'));
      });

      xhr.open('POST', url);
      xhr.send(formData);
    });
  },

  /** List all uploaded videos */
  async getVideos() {
    return await this.request('/videos');
  },

  /** Get single video metadata */
  async getVideoInfo(id) {
    return await this.request(`/videos/${id}/info`);
  },

  /** URL generator for video stream (HTTP 206 partial content) */
  getVideoStreamUrl(id) {
    return `${this.baseUrl}/videos/${id}/stream`;
  },

  /** URL generator for JPEG frame image */
  getFrameUrl(id, frameNumber) {
    return `${this.baseUrl}/videos/${id}/frame/${frameNumber}`;
  },

  /** URL generator for video thumbnail JPEG */
  getThumbnailUrl(id, frameNumber) {
    return `${this.baseUrl}/videos/${id}/thumbnail/${frameNumber}`;
  },

  /** Request conversion of non-browser codec to web-compatible preview */
  async convertVideoPreview(id) {
    return await this.request(`/videos/${id}/convert-preview`, {
      method: 'POST'
    });
  },

  /** Create/save annotation */
  async saveAnnotation(id, { onset_frame, apex_frame, offset_frame }) {
    return await this.request(`/annotations/${id}`, {
      method: 'POST',
      body: JSON.stringify({ onset_frame, apex_frame, offset_frame })
    });
  },

  /** Fetch existing annotation */
  async getAnnotation(id) {
    return await this.request(`/annotations/${id}`);
  },

  /** Update annotation */
  async updateAnnotation(id, { onset_frame, apex_frame, offset_frame }) {
    return await this.request(`/annotations/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ onset_frame, apex_frame, offset_frame })
    });
  },

  /** Extract micro-expression clip */
  async extractClip({ video_id, onset_frame, offset_frame, context_frames_before = 0, context_frames_after = 0, participant_id = '', video_label = '' }) {
    return await this.request('/clips/extract', {
      method: 'POST',
      body: JSON.stringify({
        video_id,
        onset_frame,
        offset_frame,
        context_frames_before,
        context_frames_after,
        participant_id,
        video_label
      })
    });
  },

  /** Get clip info */
  async getClipInfo(id) {
    return await this.request(`/clips/${id}/info`);
  },

  /** Get preview streaming URL for clip */
  getClipPreviewUrl(id) {
    return `${this.baseUrl}/clips/${id}/preview`;
  },

  /** Get download file URL for clip */
  getClipDownloadUrl(id) {
    return `${this.baseUrl}/clips/${id}/download`;
  },

  /** Export specific frames */
  async exportFrames({ video_id, frame_numbers, format = 'jpg', participant_id = '', video_label = '' }) {
    return await this.request('/frames/export', {
      method: 'POST',
      body: JSON.stringify({
        video_id,
        frame_numbers,
        format,
        participant_id,
        video_label
      })
    });
  },

  /** Export onset, apex, offset frames */
  async exportAnnotationFrames({ video_id, participant_id = '', video_label = '', format = 'jpg' }) {
    return await this.request('/frames/export-annotation', {
      method: 'POST',
      body: JSON.stringify({
        video_id,
        participant_id,
        video_label,
        format
      })
    });
  },

  /** Auto-detect face bounding box */
  async detectFace(videoId, frameNumber) {
    return await this.request(`/crop/detect/${videoId}/${frameNumber}`, {
      method: 'POST'
    });
  },

  /** Get preset facial bounding box */
  async cropPreset(videoId, frameNumber, preset) {
    return await this.request(`/crop/preset/${videoId}/${frameNumber}`, {
      method: 'POST',
      body: JSON.stringify({ preset })
    });
  },

  /** Apply crop */
  async applyCrop({ video_id, frame_number, x, y, width, height, participant_id = '', video_label = '', format = 'jpg' }) {
    return await this.request('/crop/apply', {
      method: 'POST',
      body: JSON.stringify({
        video_id,
        frame_number,
        x,
        y,
        width,
        height,
        participant_id,
        video_label,
        format
      })
    });
  },

  /** Check super-resolution model availability */
  async getEnhanceStatus() {
    return await this.request('/enhance/status');
  },

  /** Apply AI enhancement to image */
  async applyEnhance({ image_path, scale = 2 }) {
    return await this.request('/enhance/apply', {
      method: 'POST',
      body: JSON.stringify({ image_path, scale })
    });
  },

  /** Trigger full dataset export */
  async exportFull(exportData) {
    return await this.request('/export/full', {
      method: 'POST',
      body: JSON.stringify(exportData)
    });
  },

  /** Check backend health */
  async checkHealth() {
    try {
      const res = await fetch(`${this.baseUrl}/enhance/status`, { method: 'GET' });
      return res.ok || res.status === 404; // if reachable
    } catch (_) {
      return false;
    }
  }
};

/**
 * Main Application Class
 */
class App {
  constructor() {
    // Global State
    this.currentVideoId = null;
    this.currentFrame = 0;
    this.totalFrames = 0;
    this.fps = 30.0;
    this.videoInfo = null;

    // Boundary annotations: onset, apex, offset
    this.annotation = {
      onset: null,
      apex: null,
      offset: null
    };

    // Submodules
    this.videoPlayer = null;
    this.timeline = null;
    this.annotationPanel = null;
    this.clipExtractor = null;
    this.cropTool = null;
    this.enhancementPanel = null;
    this.exportPanel = null;

    // UI Cache Elements
    this.dom = {};
  }

  /**
   * Initialize entire application on DOM ready
   */
  async init() {
    this.cacheDomElements();
    this.bindEvents();
    this.initTabs();
    this.initShortcutsModal();

    // Initialize Submodules
    if (typeof VideoPlayer !== 'undefined') {
      this.videoPlayer = new VideoPlayer('videoCanvas', this);
    }
    if (typeof Timeline !== 'undefined') {
      this.timeline = new Timeline('timelineContainer', this);
    }
    if (typeof AnnotationPanel !== 'undefined') {
      this.annotationPanel = new AnnotationPanel(this);
    }
    if (typeof ClipExtractor !== 'undefined') {
      this.clipExtractor = new ClipExtractor(this);
    }
    if (typeof CropTool !== 'undefined') {
      this.cropTool = new CropTool('cropCanvas', this);
    }
    if (typeof EnhancementPanel !== 'undefined') {
      this.enhancementPanel = new EnhancementPanel(this);
    }
    if (typeof ExportPanel !== 'undefined') {
      this.exportPanel = new ExportPanel(this);
    }

    // Check backend connection & populate video list
    await this.checkBackendStatus();
    await this.refreshVideoList();

    this.setStatus('Ready. Upload or select a video to start annotating.', 'ready');
  }

  /**
   * Cache DOM nodes
   */
  cacheDomElements() {
    this.dom.apiStatusBadge = document.getElementById('apiStatusBadge');
    this.dom.apiStatusText = document.getElementById('apiStatusText');
    this.dom.uploadZone = document.getElementById('uploadZone');
    this.dom.videoFileInput = document.getElementById('videoFileInput');
    this.dom.browseVideoBtn = document.getElementById('browseVideoBtn');
    this.dom.uploadProgressContainer = document.getElementById('uploadProgressContainer');
    this.dom.uploadProgressBar = document.getElementById('uploadProgressBar');
    this.dom.uploadFileName = document.getElementById('uploadFileName');
    this.dom.uploadPercent = document.getElementById('uploadPercent');

    this.dom.videoListSelect = document.getElementById('videoListSelect');
    this.dom.refreshVideosBtn = document.getElementById('refreshVideosBtn');

    this.dom.videoInfoBar = document.getElementById('videoInfoBar');
    this.dom.infoFileName = document.getElementById('infoFileName');
    this.dom.infoResolution = document.getElementById('infoResolution');
    this.dom.infoFps = document.getElementById('infoFps');
    this.dom.infoTotalFrames = document.getElementById('infoTotalFrames');
    this.dom.infoDuration = document.getElementById('infoDuration');

    this.dom.appStatusMessage = document.getElementById('appStatusMessage');
    this.dom.statusIndicatorDot = document.getElementById('statusIndicatorDot');
    this.dom.currentStatusVideo = document.getElementById('currentStatusVideo');
    this.dom.toastContainer = document.getElementById('toastContainer');
  }

  /**
   * Bind global event listeners
   */
  bindEvents() {
    // Upload button click
    if (this.dom.browseVideoBtn && this.dom.videoFileInput) {
      this.dom.browseVideoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.dom.videoFileInput.click();
      });

      this.dom.uploadZone.addEventListener('click', () => {
        this.dom.videoFileInput.click();
      });

      this.dom.videoFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          this.handleVideoUpload(e.target.files[0]);
        }
      });
    }

    // Drag and Drop Upload
    if (this.dom.uploadZone) {
      ['dragenter', 'dragover'].forEach(eventName => {
        this.dom.uploadZone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.dom.uploadZone.classList.add('dragover');
        });
      });

      ['dragleave', 'drop'].forEach(eventName => {
        this.dom.uploadZone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.dom.uploadZone.classList.remove('dragover');
        });
      });

      this.dom.uploadZone.addEventListener('drop', (e) => {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          this.handleVideoUpload(e.dataTransfer.files[0]);
        }
      });
    }

    // Video select dropdown change
    if (this.dom.videoListSelect) {
      this.dom.videoListSelect.addEventListener('change', (e) => {
        const selectedId = e.target.value;
        if (selectedId) {
          this.loadVideoById(selectedId);
        }
      });
    }

    // Refresh videos list button
    if (this.dom.refreshVideosBtn) {
      this.dom.refreshVideosBtn.addEventListener('click', () => {
        this.refreshVideoList();
      });
    }

    // Global Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      this.handleGlobalKeyDown(e);
    });
  }

  /**
   * Global Keyboard Shortcuts Handler
   */
  handleGlobalKeyDown(e) {
    // Ignore keystrokes when typing into input or textarea
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
      return;
    }

    // Handle shortcuts help modal
    if (e.key === '?' || (e.shiftKey && e.key === '/')) {
      e.preventDefault();
      this.toggleShortcutsModal(true);
      return;
    }

    if (e.key === 'Escape') {
      this.toggleShortcutsModal(false);
      return;
    }

    // Annotation hotkeys
    if (e.key === 'o' || e.key === 'O' || e.key === '1') {
      e.preventDefault();
      if (this.annotationPanel) this.annotationPanel.setOnset();
      return;
    }
    if (e.key === 'a' || e.key === 'A' || e.key === '2') {
      e.preventDefault();
      if (this.annotationPanel) this.annotationPanel.setApex();
      return;
    }
    if (e.key === 'f' || e.key === 'F' || e.key === '3') {
      e.preventDefault();
      if (this.annotationPanel) this.annotationPanel.setOffset();
      return;
    }

    // Video player navigation delegation
    if (this.videoPlayer && this.currentVideoId) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) {
          this.videoPlayer.jumpFrames(-100);
        } else if (e.ctrlKey || e.metaKey) {
          this.videoPlayer.jumpFrames(-10);
        } else {
          this.videoPlayer.prevFrame();
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) {
          this.videoPlayer.jumpFrames(100);
        } else if (e.ctrlKey || e.metaKey) {
          this.videoPlayer.jumpFrames(10);
        } else {
          this.videoPlayer.nextFrame();
        }
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        this.videoPlayer.togglePlayPause();
      }
    }
  }

  /**
   * Initialize Tabs UI
   */
  initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabTarget = btn.getAttribute('data-tab');

        tabBtns.forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        tabPanes.forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');

        const targetPane = document.getElementById(`tab-${tabTarget}`);
        if (targetPane) {
          targetPane.classList.add('active');
        }

        // Notify specific panels if they need to refresh on tab show
        if (tabTarget === 'crop' && this.cropTool) {
          this.cropTool.onTabActivated();
        } else if (tabTarget === 'clip' && this.clipExtractor) {
          this.clipExtractor.syncFromAnnotations();
        } else if (tabTarget === 'export' && this.exportPanel) {
          this.exportPanel.syncFromApp();
        }
      });
    });
  }

  /**
   * Keyboard shortcuts modal setup
   */
  initShortcutsModal() {
    const modal = document.getElementById('shortcutsModal');
    const openBtn = document.getElementById('shortcutsHelpBtn');
    const closeBtn = document.getElementById('closeShortcutsModalBtn');

    if (openBtn) {
      openBtn.addEventListener('click', () => this.toggleShortcutsModal(true));
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.toggleShortcutsModal(false));
    }
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.toggleShortcutsModal(false);
      });
    }
  }

  toggleShortcutsModal(show) {
    const modal = document.getElementById('shortcutsModal');
    if (!modal) return;
    if (show) {
      modal.classList.remove('hidden');
    } else {
      modal.classList.add('hidden');
    }
  }

  /**
   * Check backend health and update status pill
   */
  async checkBackendStatus() {
    const isOnline = await api.checkHealth();
    if (this.dom.apiStatusBadge && this.dom.apiStatusText) {
      this.dom.apiStatusBadge.className = 'status-badge ' + (isOnline ? 'online' : 'offline');
      this.dom.apiStatusText.textContent = isOnline ? 'Backend Online (8000)' : 'Backend Offline';
    }
    return isOnline;
  }

  /**
   * Refresh list of uploaded videos
   */
  async refreshVideoList() {
    try {
      const select = this.dom.videoListSelect;
      if (!select) return;

      select.innerHTML = '<option value="">Loading videos...</option>';
      select.disabled = true;

      const videos = await api.getVideos();
      select.innerHTML = '';

      if (Array.isArray(videos) && videos.length > 0) {
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = `Select from ${videos.length} video(s)...`;
        select.appendChild(defaultOpt);

        videos.forEach(v => {
          const opt = document.createElement('option');
          opt.value = v.id || v.video_id;
          opt.textContent = `${v.filename || v.id} (${v.total_frames || '?'} frames, ${v.fps ? Math.round(v.fps) : '?'} fps)`;
          if (this.currentVideoId && (v.id === this.currentVideoId || v.video_id === this.currentVideoId)) {
            opt.selected = true;
          }
          select.appendChild(opt);
        });

        select.disabled = false;
      } else {
        select.innerHTML = '<option value="">No videos uploaded yet</option>';
        select.disabled = true;
      }
    } catch (err) {
      console.warn('Could not list videos:', err.message);
      if (this.dom.videoListSelect) {
        this.dom.videoListSelect.innerHTML = '<option value="">Backend disconnected</option>';
        this.dom.videoListSelect.disabled = true;
      }
    }
  }

  /**
   * Handle video file upload
   */
  async handleVideoUpload(file) {
    if (!file) return;

    // Show progress
    if (this.dom.uploadProgressContainer) {
      this.dom.uploadProgressContainer.classList.remove('hidden');
      this.dom.uploadFileName.textContent = file.name;
      this.dom.uploadProgressBar.style.width = '0%';
      this.dom.uploadPercent.textContent = '0%';
    }

    this.setStatus(`Uploading ${file.name}...`, 'working');

    try {
      const result = await api.uploadVideo(file, (percent) => {
        if (this.dom.uploadProgressBar) {
          this.dom.uploadProgressBar.style.width = `${percent}%`;
          this.dom.uploadPercent.textContent = `${percent}%`;
        }
      });

      this.showSuccess(`Video "${file.name}" uploaded successfully!`);
      this.setStatus('Video uploaded. Processing metadata...', 'working');

      // Refresh video list
      await this.refreshVideoList();

      // Load the newly uploaded video
      const newId = result.id || result.video_id;
      if (newId) {
        await this.loadVideoData(result);
      } else {
        // Fetch videos list to get last item
        const list = await api.getVideos();
        if (list && list.length > 0) {
          await this.loadVideoById(list[list.length - 1].id || list[list.length - 1].video_id);
        }
      }
    } catch (err) {
      this.showError(`Upload failed: ${err.message}`);
      this.setStatus('Upload failed.', 'error');
    } finally {
      setTimeout(() => {
        if (this.dom.uploadProgressContainer) {
          this.dom.uploadProgressContainer.classList.add('hidden');
        }
        if (this.dom.videoFileInput) {
          this.dom.videoFileInput.value = '';
        }
      }, 1000);
    }
  }

  /**
   * Load video by its ID
   */
  async loadVideoById(videoId) {
    if (!videoId) return;
    this.setStatus(`Loading metadata for video ${videoId}...`, 'working');

    try {
      const info = await api.getVideoInfo(videoId);
      await this.loadVideoData(info);
    } catch (err) {
      this.showError(`Failed to load video info: ${err.message}`);
      this.setStatus('Failed to load video.', 'error');
    }
  }

  /**
   * Set up active video state across all components
   */
  async loadVideoData(info) {
    this.videoInfo = info;
    this.currentVideoId = info.id || info.video_id;
    this.totalFrames = info.total_frames || info.totalFrames || 0;
    this.fps = info.fps || 30.0;
    this.currentFrame = 0;

    // Reset annotations
    this.annotation = { onset: null, apex: null, offset: null };

    // Update video selector dropdown
    if (this.dom.videoListSelect) {
      this.dom.videoListSelect.value = this.currentVideoId;
    }

    // Update Video Info Bar
    if (this.dom.videoInfoBar) {
      this.dom.videoInfoBar.classList.remove('hidden');
      this.dom.infoFileName.textContent = info.filename || `video_${this.currentVideoId}`;
      this.dom.infoResolution.textContent = `${info.width || '?'} × ${info.height || '?'}`;
      this.dom.infoFps.textContent = `${(this.fps).toFixed(2)} fps`;
      this.dom.infoTotalFrames.textContent = `${this.totalFrames} frames`;
      this.dom.infoDuration.textContent = this.formatDuration(info.duration || (this.totalFrames / this.fps));
    }

    // Hide empty placeholder
    const placeholder = document.getElementById('emptyVideoPlaceholder');
    if (placeholder) placeholder.classList.add('hidden');

    // Notify Video Player
    if (this.videoPlayer) {
      const streamUrl = info.stream_url || api.getVideoStreamUrl(this.currentVideoId);
      this.videoPlayer.setVideo(this.currentVideoId, this.totalFrames, this.fps, info.width, info.height, streamUrl);
    }

    // Notify Timeline
    if (this.timeline) {
      this.timeline.setRange(this.totalFrames, this.fps);
      this.timeline.clearAllMarkers();
    }

    // Try loading existing annotations from backend
    try {
      const existing = await api.getAnnotation(this.currentVideoId);
      if (existing) {
        this.setAnnotationData(existing.onset_frame, existing.apex_frame, existing.offset_frame, false);
      }
    } catch (_) {
      // No existing annotation, perfectly fine
    }

    // Notify Annotation Panel
    if (this.annotationPanel) {
      this.annotationPanel.onVideoLoaded();
    }

    // Notify Clip Extractor
    if (this.clipExtractor) {
      this.clipExtractor.onVideoLoaded(info);
    }

    // Notify Crop Tool
    if (this.cropTool) {
      this.cropTool.onVideoLoaded(info);
    }

    // Notify Export Panel
    if (this.exportPanel) {
      this.exportPanel.onVideoLoaded(info);
    }

    if (this.dom.currentStatusVideo) {
      this.dom.currentStatusVideo.textContent = info.filename || `Video #${this.currentVideoId}`;
    }

    this.setStatus(`Loaded ${info.filename || this.currentVideoId}. Ready for annotation.`, 'ready');
  }

  /**
   * Set annotation data and broadcast to all modules
   */
  setAnnotationData(onset, apex, offset, syncBackend = false) {
    this.annotation.onset = (onset !== undefined && onset !== null && onset !== '') ? parseInt(onset, 10) : null;
    this.annotation.apex = (apex !== undefined && apex !== null && apex !== '') ? parseInt(apex, 10) : null;
    this.annotation.offset = (offset !== undefined && offset !== null && offset !== '') ? parseInt(offset, 10) : null;

    // Update timeline markers
    if (this.timeline) {
      this.timeline.updateMarkers(this.annotation);
    }

    // Update annotation panel UI
    if (this.annotationPanel) {
      this.annotationPanel.renderAnnotations(this.annotation);
    }

    // Update clip extractor
    if (this.clipExtractor) {
      this.clipExtractor.syncFromAnnotations();
    }

    if (syncBackend && this.currentVideoId) {
      this.saveAnnotationsToBackend();
    }
  }

  /**
   * Save annotations to backend
   */
  async saveAnnotationsToBackend() {
    if (!this.currentVideoId) return;
    try {
      await api.saveAnnotation(this.currentVideoId, {
        onset_frame: this.annotation.onset,
        apex_frame: this.annotation.apex,
        offset_frame: this.annotation.offset
      });
      this.showSuccess('Annotations saved to backend.');
    } catch (err) {
      // If POST fails, try PUT
      try {
        await api.updateAnnotation(this.currentVideoId, {
          onset_frame: this.annotation.onset,
          apex_frame: this.annotation.apex,
          offset_frame: this.annotation.offset
        });
        this.showSuccess('Annotations updated on backend.');
      } catch (putErr) {
        this.showError(`Failed to save annotations: ${err.message}`);
      }
    }
  }

  /**
   * Frame change notification from player or timeline
   */
  onFrameChanged(frameNumber) {
    this.currentFrame = frameNumber;

    // Update Timeline slider / playhead
    if (this.timeline) {
      this.timeline.setCurrentFrame(frameNumber);
    }

    // Redraw crop overlay if crop tool is active
    if (this.cropTool) {
      this.cropTool.onFrameChanged(frameNumber);
    }
  }

  /**
   * Update bottom status bar
   */
  setStatus(message, state = 'ready') {
    if (this.dom.appStatusMessage) {
      this.dom.appStatusMessage.textContent = message;
    }
    if (this.dom.statusIndicatorDot) {
      this.dom.statusIndicatorDot.className = `status-dot-indicator ${state}`;
    }
  }

  /**
   * Update cache status indicator in footer
   */
  setCacheStatus(cachedCount) {
    const el = document.getElementById('cacheStatusText');
    if (el) {
      el.textContent = `Cache: ${cachedCount} frames`;
    }
  }

  /**
   * Toast Notifications System
   */
  showNotification(message, type = 'info', duration = 3500) {
    if (!this.dom.toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const iconMap = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };

    toast.innerHTML = `
      <span class="toast-icon">${iconMap[type] || 'ℹ'}</span>
      <div class="toast-message">${message}</div>
      <button class="toast-close" aria-label="Close">&times;</button>
    `;

    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => {
      this.removeToast(toast);
    });

    this.dom.toastContainer.appendChild(toast);

    if (duration > 0) {
      setTimeout(() => {
        this.removeToast(toast);
      }, duration);
    }
  }

  removeToast(toast) {
    if (!toast || !toast.parentNode) return;
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 250);
  }

  showSuccess(message) {
    this.showNotification(message, 'success');
  }

  showError(message) {
    this.showNotification(message, 'error', 5000);
  }

  showWarning(message) {
    this.showNotification(message, 'warning', 4500);
  }

  showInfo(message) {
    this.showNotification(message, 'info');
  }

  /**
   * Format frame number to timestamp string (HH:MM:SS.mmm)
   */
  formatTimestamp(frameNumber, fps = 30.0) {
    if (frameNumber === null || frameNumber === undefined || isNaN(frameNumber)) return '--:--:--.---';
    const totalSeconds = frameNumber / (fps || 30.0);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const milliseconds = Math.floor((totalSeconds % 1) * 1000);

    const pad = (n, width = 2) => String(n).padStart(width, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(milliseconds, 3)}`;
  }

  /**
   * Format duration in seconds to human readable string
   */
  formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '0s';
    if (seconds < 60) {
      return `${seconds.toFixed(2)}s`;
    }
    const mins = Math.floor(seconds / 60);
    const remainingSecs = (seconds % 60).toFixed(1);
    return `${mins}m ${remainingSecs}s`;
  }
}

// Global window attachment for all modules and devtools
window.api = api;
window.App = App;

// Bootstrap on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
  window.app.init();
});
