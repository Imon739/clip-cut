/**
 * Micro-Expression Video Annotation & Clip Extractor
 * File 5: frontend/js/timeline.js
 * Interactive Timeline with Canvas Markers, Expression Span Band, and Scrubbing
 */

class Timeline {
  /**
   * @param {string|HTMLElement} containerTarget - Container element or ID
   * @param {App} app - Main app instance reference
   */
  constructor(containerTarget, app) {
    this.app = app;
    this.container = typeof containerTarget === 'string' ? document.getElementById(containerTarget) : containerTarget;

    this.canvas = document.getElementById('timelineCanvas');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.slider = document.getElementById('timelineSlider');
    this.tooltip = document.getElementById('timelineTooltip');
    this.spanText = document.getElementById('timelineSpanText');

    // State
    this.totalFrames = 0;
    this.fps = 30.0;
    this.currentFrame = 0;

    this.markers = {
      onset: null,
      apex: null,
      offset: null
    };

    // Color definitions
    this.colors = {
      onset: '#4CAF50',
      apex: '#FFC107',
      offset: '#e94560',
      spanBand: 'rgba(76, 175, 80, 0.22)',
      playhead: '#38bdf8',
      tick: '#334155',
      tickMajor: '#64748b',
      text: '#94a3b8'
    };

    this.bindEvents();
    this.initCanvasSize();
  }

  /**
   * Bind slider events, hover tooltips, and resize observers
   */
  bindEvents() {
    // Scrubbing on range slider
    if (this.slider) {
      this.slider.addEventListener('input', (e) => {
        const frame = parseInt(e.target.value, 10);
        this.currentFrame = frame;
        if (this.app && this.app.videoPlayer) {
          this.app.videoPlayer.goToFrame(frame);
        }
        this.draw();
      });

      this.slider.addEventListener('change', (e) => {
        const frame = parseInt(e.target.value, 10);
        this.currentFrame = frame;
        if (this.app && this.app.videoPlayer) {
          this.app.videoPlayer.goToFrame(frame);
        }
        this.draw();
      });
    }

    // Hover tooltip tracking
    const trackWrapper = this.container ? this.container.querySelector('.timeline-track-wrapper') : null;
    if (trackWrapper && this.tooltip) {
      trackWrapper.addEventListener('mousemove', (e) => {
        if (this.totalFrames <= 0) return;
        const rect = trackWrapper.getBoundingClientRect();
        const offsetX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const ratio = offsetX / rect.width;
        const hoveredFrame = Math.round(ratio * (this.totalFrames - 1));

        this.tooltip.classList.remove('hidden');
        this.tooltip.style.left = `${offsetX}px`;

        const timeStr = this.app ? this.app.formatTimestamp(hoveredFrame, this.fps) : '';
        this.tooltip.textContent = `Frame ${hoveredFrame} (${timeStr})`;
      });

      trackWrapper.addEventListener('mouseleave', () => {
        this.tooltip.classList.add('hidden');
      });
    }

    // Window resize observer
    window.addEventListener('resize', () => {
      this.initCanvasSize();
      this.draw();
    });
  }

  /**
   * Ensure crisp canvas resolution on high-DPI displays
   */
  initCanvasSize() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    const width = rect.width || (this.canvas.parentElement ? this.canvas.parentElement.clientWidth : 720);
    const height = 36;

    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;

    if (this.ctx) {
      this.ctx.scale(dpr, dpr);
    }

    this.displayWidth = width;
    this.displayHeight = height;
  }

  /**
   * Set timeline range when a video is loaded
   */
  setRange(totalFrames, fps) {
    this.totalFrames = totalFrames || 0;
    this.fps = fps || 30.0;
    this.currentFrame = 0;

    const maxFrame = Math.max(0, this.totalFrames - 1);

    if (this.slider) {
      this.slider.min = 0;
      this.slider.max = maxFrame;
      this.slider.value = 0;
      this.slider.disabled = this.totalFrames <= 0;
    }

    this.initCanvasSize();
    this.draw();
  }

  /**
   * Update active scrubber frame position
   */
  setCurrentFrame(frame) {
    this.currentFrame = Math.max(0, Math.min(frame, this.totalFrames - 1));

    if (this.slider && document.activeElement !== this.slider) {
      this.slider.value = this.currentFrame;
    }

    this.draw();
  }

  /**
   * Set specific marker
   */
  setMarker(type, frame) {
    if (this.markers.hasOwnProperty(type)) {
      this.markers[type] = frame !== null && frame !== undefined ? parseInt(frame, 10) : null;
      this.updateSummaryText();
      this.draw();
    }
  }

  /**
   * Clear specific marker
   */
  clearMarker(type) {
    if (this.markers.hasOwnProperty(type)) {
      this.markers[type] = null;
      this.updateSummaryText();
      this.draw();
    }
  }

  /**
   * Clear all markers
   */
  clearAllMarkers() {
    this.markers = { onset: null, apex: null, offset: null };
    this.updateSummaryText();
    this.draw();
  }

  /**
   * Sync markers from annotation object
   */
  updateMarkers(annotation) {
    if (!annotation) return;
    this.markers.onset = annotation.onset !== undefined ? annotation.onset : null;
    this.markers.apex = annotation.apex !== undefined ? annotation.apex : null;
    this.markers.offset = annotation.offset !== undefined ? annotation.offset : null;
    this.updateSummaryText();
    this.draw();
  }

  /**
   * Update timeline header status text
   */
  updateSummaryText() {
    if (!this.spanText) return;

    const { onset, apex, offset } = this.markers;

    if (onset !== null && offset !== null) {
      const spanFrames = offset - onset + 1;
      const spanSecs = (spanFrames / (this.fps || 30.0)).toFixed(2);
      this.spanText.textContent = `Span: ${onset} → ${offset} (${spanFrames} frames, ${spanSecs}s)`;
      this.spanText.style.color = '#10B981';
    } else if (onset !== null || apex !== null || offset !== null) {
      const parts = [];
      if (onset !== null) parts.push(`Onset: ${onset}`);
      if (apex !== null) parts.push(`Apex: ${apex}`);
      if (offset !== null) parts.push(`Offset: ${offset}`);
      this.spanText.textContent = parts.join(' | ');
      this.spanText.style.color = '#94a3b8';
    } else {
      this.spanText.textContent = 'No annotations set';
      this.spanText.style.color = '#64748b';
    }
  }

  /**
   * Convert frame number to horizontal pixel coordinate on timeline
   */
  frameToX(frame) {
    if (this.totalFrames <= 1) return 0;
    const ratio = Math.max(0, Math.min(frame, this.totalFrames - 1)) / (this.totalFrames - 1);
    return ratio * this.displayWidth;
  }

  /**
   * Draw complete timeline canvas
   */
  draw() {
    if (!this.ctx || !this.canvas || !this.displayWidth) return;

    const ctx = this.ctx;
    const w = this.displayWidth;
    const h = this.displayHeight;

    // Clear background
    ctx.clearRect(0, 0, w, h);

    if (this.totalFrames <= 0) return;

    // 1. Draw periodic ticks along bottom
    const stepRatio = w > 600 ? 0.05 : 0.1; // 5% or 10% divisions
    const numTicks = Math.round(1 / stepRatio);

    ctx.lineWidth = 1;
    for (let i = 0; i <= numTicks; i++) {
      const tickX = i * stepRatio * w;
      const isMajor = i % 2 === 0;

      ctx.strokeStyle = isMajor ? this.colors.tickMajor : this.colors.tick;
      ctx.beginPath();
      ctx.moveTo(tickX, h - (isMajor ? 8 : 4));
      ctx.lineTo(tickX, h);
      ctx.stroke();
    }

    // 2. Draw Expression Span Highlight Band (Onset -> Offset)
    const { onset, apex, offset } = this.markers;
    if (onset !== null && offset !== null && onset <= offset) {
      const startX = this.frameToX(onset);
      const endX = this.frameToX(offset);
      const bandWidth = Math.max(2, endX - startX);

      // Shaded band fill
      ctx.fillStyle = this.colors.spanBand;
      ctx.fillRect(startX, 0, bandWidth, h);

      // Top and bottom boundary lines
      ctx.strokeStyle = 'rgba(76, 175, 80, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(startX, 0);
      ctx.lineTo(endX, 0);
      ctx.moveTo(startX, h);
      ctx.lineTo(endX, h);
      ctx.stroke();
    }

    // 3. Draw Marker Lines & Badges
    // Draw Onset
    if (onset !== null) {
      this.drawMarkerLine(onset, this.colors.onset, 'O', 'bottom');
    }

    // Draw Offset
    if (offset !== null) {
      this.drawMarkerLine(offset, this.colors.offset, 'F', 'bottom');
    }

    // Draw Apex (drawn after to overlap cleanly)
    if (apex !== null) {
      this.drawMarkerLine(apex, this.colors.apex, 'A', 'top');
    }

    // 4. Draw Current Playhead Line
    const playheadX = this.frameToX(this.currentFrame);
    ctx.strokeStyle = this.colors.playhead;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, h);
    ctx.stroke();
  }

  /**
   * Helper to draw a single marker line with badge tag
   */
  drawMarkerLine(frame, color, label, tagPosition = 'top') {
    const ctx = this.ctx;
    const x = this.frameToX(frame);
    const h = this.displayHeight;

    // Vertical line
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();

    // Pin/Flag
    const tagSize = 12;
    const tagY = tagPosition === 'top' ? 6 : h - 6;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, tagY, 5, 0, Math.PI * 2);
    ctx.fill();

    // Small label text inside or beside
    ctx.fillStyle = color === '#FFC107' ? '#1a1a2e' : '#ffffff';
    ctx.font = 'bold 8px Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, tagY);
  }
}

// Global attachment
window.Timeline = Timeline;
