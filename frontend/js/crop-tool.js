/**
 * Micro-Expression Video Annotation & Clip Extractor
 * File 8: frontend/js/crop-tool.js
 * Interactive Canvas Crop Overlay with 8-Point Transform Handles, Face Detection, and Presets
 */

class CropTool {
  /**
   * @param {string|HTMLCanvasElement} canvasTarget - Crop canvas overlay element or ID
   * @param {App} app - Main app instance reference
   */
  constructor(canvasTarget, app) {
    this.app = app;
    this.canvas = typeof canvasTarget === 'string' ? document.getElementById(canvasTarget) : canvasTarget;
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;

    // Crop box in Video Frame coordinate space
    this.crop = {
      x: 100,
      y: 100,
      width: 200,
      height: 200
    };

    this.isVisible = true;
    this.handleRadius = 6;
    this.activeInteraction = null; // null | 'move' | 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'e' | 'w' | 'create'
    this.dragStart = { mouseX: 0, mouseY: 0, cropX: 0, cropY: 0, cropW: 0, cropH: 0 };

    // DOM Elements
    this.dom = {
      autoDetectBtn: document.getElementById('autoDetectFaceBtn'),
      presetBtns: document.querySelectorAll('.crop-preset-btn'),
      inputX: document.getElementById('cropCoordX'),
      inputY: document.getElementById('cropCoordY'),
      inputW: document.getElementById('cropCoordW'),
      inputH: document.getElementById('cropCoordH'),
      formatRadios: document.getElementsByName('cropFormat'),
      toggleOverlayBtn: document.getElementById('toggleCropOverlayBtn'),
      previewCanvas: document.getElementById('cropPreviewCanvas'),
      saveCropBtn: document.getElementById('saveCropBtn'),
      applyAllBtn: document.getElementById('applyCropToAllBtn'),
      cropStatusAlert: document.getElementById('cropStatusAlert'),
      cropStatusText: document.getElementById('cropStatusText')
    };

    this.previewCtx = this.dom.previewCanvas ? this.dom.previewCanvas.getContext('2d') : null;

    this.bindEvents();
  }

  /**
   * Bind mouse, touch, and UI input events
   */
  bindEvents() {
    if (this.canvas) {
      // Mouse events
      this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
      window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
      window.addEventListener('mouseup', () => this.handleMouseUp());

      // Touch events
      this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
      window.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
      window.addEventListener('touchend', () => this.handleMouseUp());
    }

    // Auto-detect face
    if (this.dom.autoDetectBtn) {
      this.dom.autoDetectBtn.addEventListener('click', () => this.autoDetectFace());
    }

    // Presets
    if (this.dom.presetBtns) {
      this.dom.presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const preset = btn.getAttribute('data-preset');
          if (preset) this.applyPreset(preset);
        });
      });
    }

    // Coordinate inputs
    [
      { el: this.dom.inputX, prop: 'x' },
      { el: this.dom.inputY, prop: 'y' },
      { el: this.dom.inputW, prop: 'width' },
      { el: this.dom.inputH, prop: 'height' }
    ].forEach(({ el, prop }) => {
      if (!el) return;
      el.addEventListener('change', () => {
        const val = parseInt(el.value, 10);
        if (!isNaN(val) && val >= 0) {
          this.crop[prop] = val;
          this.clampCropBox();
          this.drawOverlay();
          this.updatePreview();
        } else {
          el.value = this.crop[prop];
        }
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') el.blur();
      });
    });

    // Toggle overlay display
    if (this.dom.toggleOverlayBtn) {
      this.dom.toggleOverlayBtn.addEventListener('click', () => {
        this.isVisible = !this.isVisible;
        this.dom.toggleOverlayBtn.textContent = this.isVisible ? 'Hide Crop Box' : 'Show Crop Box';
        this.drawOverlay();
      });
    }

    // Save crop button
    if (this.dom.saveCropBtn) {
      this.dom.saveCropBtn.addEventListener('click', () => this.saveCrop());
    }

    // Apply to all annotation frames
    if (this.dom.applyAllBtn) {
      this.dom.applyAllBtn.addEventListener('click', () => this.applyCropToAllAnnotationFrames());
    }
  }

  /**
   * Called when a new video is loaded
   */
  onVideoLoaded(info) {
    const vidW = info.width || 720;
    const vidH = info.height || 480;

    // Initialize crop to central 50%
    const defaultW = Math.round(vidW * 0.5);
    const defaultH = Math.round(vidH * 0.5);
    this.crop = {
      x: Math.round((vidW - defaultW) / 2),
      y: Math.round((vidH - defaultH) / 2),
      width: defaultW,
      height: defaultH
    };

    // Enable buttons
    if (this.dom.autoDetectBtn) this.dom.autoDetectBtn.disabled = false;
    if (this.dom.presetBtns) this.dom.presetBtns.forEach(b => b.disabled = false);
    if (this.dom.saveCropBtn) this.dom.saveCropBtn.disabled = false;
    if (this.dom.applyAllBtn) this.dom.applyAllBtn.disabled = false;

    this.syncCanvasDimensions();
    this.updateInputs();
    this.drawOverlay();
    this.updatePreview();
  }

  onTabActivated() {
    this.syncCanvasDimensions();
    this.drawOverlay();
    this.updatePreview();
  }

  onFrameChanged() {
    this.drawOverlay();
    this.updatePreview();
  }

  /**
   * Sync crop canvas resolution to video canvas resolution
   */
  syncCanvasDimensions() {
    if (!this.canvas || !this.app || !this.app.videoPlayer || !this.app.videoPlayer.canvas) return;
    const vidCanvas = this.app.videoPlayer.canvas;
    this.canvas.width = vidCanvas.width;
    this.canvas.height = vidCanvas.height;
  }

  /**
   * Get mouse position relative to canvas
   */
  getCanvasMousePos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  /**
   * Compute bounding box in canvas coordinate pixels
   */
  getCanvasCropRect() {
    if (!this.app || !this.app.videoPlayer) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
    const vp = this.app.videoPlayer;
    const topLeft = vp.videoToCanvasCoords(this.crop.x, this.crop.y);
    const bottomRight = vp.videoToCanvasCoords(this.crop.x + this.crop.width, this.crop.y + this.crop.height);

    return {
      x: topLeft.x,
      y: topLeft.y,
      width: Math.max(1, bottomRight.x - topLeft.x),
      height: Math.max(1, bottomRight.y - topLeft.y)
    };
  }

  /**
   * Hit test for resize handles or box dragging
   */
  hitTest(mouseX, mouseY) {
    const r = this.getCanvasCropRect();
    const radius = this.handleRadius + 3;

    // Handles map
    const handles = {
      nw: { x: r.x, y: r.y },
      ne: { x: r.x + r.width, y: r.y },
      se: { x: r.x + r.width, y: r.y + r.height },
      sw: { x: r.x, y: r.y + r.height },
      n: { x: r.x + r.width / 2, y: r.y },
      s: { x: r.x + r.width / 2, y: r.y + r.height },
      w: { x: r.x, y: r.y + r.height / 2 },
      e: { x: r.x + r.width, y: r.y + r.height / 2 }
    };

    for (const [key, pt] of Object.entries(handles)) {
      if (Math.abs(mouseX - pt.x) <= radius && Math.abs(mouseY - pt.y) <= radius) {
        return key;
      }
    }

    // Inside box
    if (mouseX >= r.x && mouseX <= r.x + r.width && mouseY >= r.y && mouseY <= r.y + r.height) {
      return 'move';
    }

    return 'create';
  }

  handleMouseDown(e) {
    if (!this.isVisible || !this.app.currentVideoId) return;

    const pos = this.getCanvasMousePos(e);
    const hit = this.hitTest(pos.x, pos.y);

    this.activeInteraction = hit;
    this.dragStart = {
      mouseX: pos.x,
      mouseY: pos.y,
      cropX: this.crop.x,
      cropY: this.crop.y,
      cropW: this.crop.width,
      cropH: this.crop.height
    };

    if (hit === 'create') {
      const vidCoords = this.app.videoPlayer.canvasToVideoCoords(pos.x, pos.y);
      this.crop.x = vidCoords.x;
      this.crop.y = vidCoords.y;
      this.crop.width = 1;
      this.crop.height = 1;
      this.activeInteraction = 'se';
    }
  }

  handleMouseMove(e) {
    if (!this.canvas || !this.app || !this.app.videoPlayer) return;

    const pos = this.getCanvasMousePos(e);

    // Update cursor style if not currently dragging
    if (!this.activeInteraction) {
      const hit = this.hitTest(pos.x, pos.y);
      const cursorMap = {
        nw: 'nwse-resize',
        se: 'nwse-resize',
        ne: 'nesw-resize',
        sw: 'nesw-resize',
        n: 'ns-resize',
        s: 'ns-resize',
        w: 'ew-resize',
        e: 'ew-resize',
        move: 'move',
        create: 'crosshair'
      };
      this.canvas.style.cursor = cursorMap[hit] || 'default';
      return;
    }

    const vp = this.app.videoPlayer;
    const currentVidCoords = vp.canvasToVideoCoords(pos.x, pos.y);
    const startVidCoords = vp.canvasToVideoCoords(this.dragStart.mouseX, this.dragStart.mouseY);

    const deltaX = currentVidCoords.x - startVidCoords.x;
    const deltaY = currentVidCoords.y - startVidCoords.y;

    const minSize = 20;

    if (this.activeInteraction === 'move') {
      this.crop.x = this.dragStart.cropX + deltaX;
      this.crop.y = this.dragStart.cropY + deltaY;
    } else {
      // Resize handling
      let { cropX, cropY, cropW, cropH } = this.dragStart;

      if (this.activeInteraction.includes('e')) {
        this.crop.width = Math.max(minSize, cropW + deltaX);
      }
      if (this.activeInteraction.includes('s')) {
        this.crop.height = Math.max(minSize, cropH + deltaY);
      }
      if (this.activeInteraction.includes('w')) {
        const newW = cropW - deltaX;
        if (newW >= minSize) {
          this.crop.width = newW;
          this.crop.x = cropX + deltaX;
        }
      }
      if (this.activeInteraction.includes('n')) {
        const newH = cropH - deltaY;
        if (newH >= minSize) {
          this.crop.height = newH;
          this.crop.y = cropY + deltaY;
        }
      }
    }

    this.clampCropBox();
    this.updateInputs();
    this.drawOverlay();
    this.updatePreview();
  }

  handleMouseUp() {
    this.activeInteraction = null;
    this.clampCropBox();
    this.updateInputs();
    this.drawOverlay();
    this.updatePreview();
  }

  // Touch wrapper
  handleTouchStart(e) {
    if (e.touches.length === 1) {
      e.preventDefault();
      this.handleMouseDown(e.touches[0]);
    }
  }

  handleTouchMove(e) {
    if (e.touches.length === 1 && this.activeInteraction) {
      e.preventDefault();
      this.handleMouseMove(e.touches[0]);
    }
  }

  /**
   * Keep crop box within video boundaries
   */
  clampCropBox() {
    const vidW = this.app && this.app.videoPlayer ? this.app.videoPlayer.videoWidth : 720;
    const vidH = this.app && this.app.videoPlayer ? this.app.videoPlayer.videoHeight : 480;

    this.crop.width = Math.min(Math.max(20, this.crop.width), vidW);
    this.crop.height = Math.min(Math.max(20, this.crop.height), vidH);

    this.crop.x = Math.max(0, Math.min(this.crop.x, vidW - this.crop.width));
    this.crop.y = Math.max(0, Math.min(this.crop.y, vidH - this.crop.height));
  }

  /**
   * Sync input numbers with current crop state
   */
  updateInputs() {
    if (this.dom.inputX && document.activeElement !== this.dom.inputX) this.dom.inputX.value = Math.round(this.crop.x);
    if (this.dom.inputY && document.activeElement !== this.dom.inputY) this.dom.inputY.value = Math.round(this.crop.y);
    if (this.dom.inputW && document.activeElement !== this.dom.inputW) this.dom.inputW.value = Math.round(this.crop.width);
    if (this.dom.inputH && document.activeElement !== this.dom.inputH) this.dom.inputH.value = Math.round(this.crop.height);
  }

  /**
   * Draw crop overlay & handles on cropCanvas
   */
  drawOverlay() {
    if (!this.ctx || !this.canvas) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (!this.isVisible || !this.app.currentVideoId) return;

    const r = this.getCanvasCropRect();

    // 1. Semi-transparent backdrop outside crop
    this.ctx.fillStyle = 'rgba(10, 15, 30, 0.55)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Punch out crop hole
    this.ctx.clearRect(r.x, r.y, r.width, r.height);

    // 2. Crop border outline
    this.ctx.strokeStyle = '#e94560';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(r.x, r.y, r.width, r.height);

    // Subtle rule of thirds inside crop box
    this.ctx.strokeStyle = 'rgba(233, 69, 96, 0.25)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(r.x + r.width / 3, r.y);
    this.ctx.lineTo(r.x + r.width / 3, r.y + r.height);
    this.ctx.moveTo(r.x + (r.width * 2) / 3, r.y);
    this.ctx.lineTo(r.x + (r.width * 2) / 3, r.y + r.height);
    this.ctx.moveTo(r.x, r.y + r.height / 3);
    this.ctx.lineTo(r.x + r.width, r.y + r.height / 3);
    this.ctx.moveTo(r.x, r.y + (r.height * 2) / 3);
    this.ctx.lineTo(r.x + r.width, r.y + (r.height * 2) / 3);
    this.ctx.stroke();

    // 3. Draw 8 Handles
    const handles = [
      { x: r.x, y: r.y }, // nw
      { x: r.x + r.width, y: r.y }, // ne
      { x: r.x + r.width, y: r.y + r.height }, // se
      { x: r.x, y: r.y + r.height }, // sw
      { x: r.x + r.width / 2, y: r.y }, // n
      { x: r.x + r.width / 2, y: r.y + r.height }, // s
      { x: r.x, y: r.y + r.height / 2 }, // w
      { x: r.x + r.width, y: r.y + r.height / 2 } // e
    ];

    this.ctx.fillStyle = '#ffffff';
    this.ctx.strokeStyle = '#e94560';
    this.ctx.lineWidth = 2;

    const rad = this.handleRadius;
    handles.forEach(h => {
      this.ctx.fillRect(h.x - rad / 2, h.y - rad / 2, rad, rad);
      this.ctx.strokeRect(h.x - rad / 2, h.y - rad / 2, rad, rad);
    });

    // 4. Coordinates & Dimensions Tag
    const tagText = `${Math.round(this.crop.width)} × ${Math.round(this.crop.height)}`;
    this.ctx.font = '11px JetBrains Mono, monospace';
    this.ctx.fillStyle = 'rgba(22, 33, 62, 0.85)';
    const textW = this.ctx.measureText(tagText).width + 8;
    this.ctx.fillRect(r.x, Math.max(0, r.y - 18), textW, 16);

    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillText(tagText, r.x + 4, Math.max(12, r.y - 6));
  }

  /**
   * Render cropped slice into preview canvas
   */
  updatePreview() {
    if (!this.previewCtx || !this.dom.previewCanvas || !this.app || !this.app.videoPlayer) return;
    const currentImg = this.app.videoPlayer.currentImage;
    if (!currentImg) return;

    const pCanvas = this.dom.previewCanvas;
    const pCtx = this.previewCtx;

    pCtx.fillStyle = '#000000';
    pCtx.fillRect(0, 0, pCanvas.width, pCanvas.height);

    // Calculate aspect scaling of crop box inside preview canvas
    const cropAspect = this.crop.width / this.crop.height;
    const canvasAspect = pCanvas.width / pCanvas.height;

    let destW, destH, destX, destY;
    if (cropAspect > canvasAspect) {
      destW = pCanvas.width;
      destH = destW / cropAspect;
      destX = 0;
      destY = (pCanvas.height - destH) / 2;
    } else {
      destH = pCanvas.height;
      destW = destH * cropAspect;
      destX = (pCanvas.width - destW) / 2;
      destY = 0;
    }

    pCtx.drawImage(
      currentImg,
      this.crop.x,
      this.crop.y,
      this.crop.width,
      this.crop.height,
      destX,
      destY,
      destW,
      destH
    );
  }

  /**
   * Auto-detect face using backend detector
   */
  async autoDetectFace() {
    if (!this.app.currentVideoId) return;

    this.app.setStatus('Detecting face on current frame...', 'working');
    if (this.dom.autoDetectBtn) this.dom.autoDetectBtn.disabled = true;

    try {
      const bbox = await api.detectFace(this.app.currentVideoId, this.app.currentFrame);
      if (bbox && bbox.width && bbox.height) {
        this.crop = {
          x: Math.round(bbox.x),
          y: Math.round(bbox.y),
          width: Math.round(bbox.width),
          height: Math.round(bbox.height)
        };
        this.clampCropBox();
        this.updateInputs();
        this.drawOverlay();
        this.updatePreview();
        this.app.showSuccess('Face detected successfully!');
        this.app.setStatus('Face detected.', 'ready');
      } else {
        this.app.showWarning('No face detected on this frame.');
        this.app.setStatus('No face detected.', 'ready');
      }
    } catch (err) {
      this.app.showError(`Face detection failed: ${err.message}`);
      this.app.setStatus('Face detection error.', 'error');
    } finally {
      if (this.dom.autoDetectBtn) this.dom.autoDetectBtn.disabled = false;
    }
  }

  /**
   * Apply preset region (full_face, eyes, eyebrows, mouth)
   */
  async applyPreset(preset) {
    if (!this.app.currentVideoId) return;

    this.app.setStatus(`Calculating ${preset.replace('_', ' ')} preset...`, 'working');

    try {
      const bbox = await api.cropPreset(this.app.currentVideoId, this.app.currentFrame, preset);
      if (bbox && bbox.width && bbox.height) {
        this.crop = {
          x: Math.round(bbox.x),
          y: Math.round(bbox.y),
          width: Math.round(bbox.width),
          height: Math.round(bbox.height)
        };
        this.clampCropBox();
        this.updateInputs();
        this.drawOverlay();
        this.updatePreview();
        this.app.showSuccess(`Applied preset: ${preset.replace('_', ' ')}`);
        this.app.setStatus('Preset applied.', 'ready');
      }
    } catch (err) {
      this.app.showError(`Preset failed: ${err.message}`);
      this.app.setStatus('Preset error.', 'error');
    }
  }

  getSelectedFormat() {
    let fmt = 'jpg';
    if (this.dom.formatRadios) {
      for (const r of this.dom.formatRadios) {
        if (r.checked) {
          fmt = r.value;
          break;
        }
      }
    }
    return fmt;
  }

  /**
   * Save cropped frame to backend
   */
  async saveCrop() {
    if (!this.app.currentVideoId) return;

    const format = this.getSelectedFormat();
    this.app.setStatus('Saving crop to dataset...', 'working');
    if (this.dom.saveCropBtn) this.dom.saveCropBtn.disabled = true;

    try {
      const payload = {
        video_id: this.app.currentVideoId,
        frame_number: this.app.currentFrame,
        x: Math.round(this.crop.x),
        y: Math.round(this.crop.y),
        width: Math.round(this.crop.width),
        height: Math.round(this.crop.height),
        participant_id: this.app.clipExtractor ? this.app.clipExtractor.dom.clipParticipantId.value : '',
        video_label: this.app.clipExtractor ? this.app.clipExtractor.dom.clipVideoLabel.value : '',
        format
      };

      const res = await api.applyCrop(payload);
      this.app.showSuccess(`Cropped frame ${this.app.currentFrame} saved successfully!`);
      this.app.setStatus('Crop saved.', 'ready');

      if (this.dom.cropStatusAlert && this.dom.cropStatusText) {
        this.dom.cropStatusAlert.className = 'validation-alert success';
        this.dom.cropStatusText.textContent = `Frame ${this.app.currentFrame} saved (${this.crop.width}×${this.crop.height} ${format.toUpperCase()})`;
        this.dom.cropStatusAlert.classList.remove('hidden');
      }
    } catch (err) {
      this.app.showError(`Save crop failed: ${err.message}`);
      this.app.setStatus('Save crop failed.', 'error');
    } finally {
      if (this.dom.saveCropBtn) this.dom.saveCropBtn.disabled = false;
    }
  }

  /**
   * Apply crop bounding box across all annotated frames (onset, apex, offset)
   */
  async applyCropToAllAnnotationFrames() {
    if (!this.app.currentVideoId) return;

    const { onset, apex, offset } = this.app.annotation;
    const targetFrames = [];
    if (onset !== null) targetFrames.push({ type: 'Onset', frame: onset });
    if (apex !== null) targetFrames.push({ type: 'Apex', frame: apex });
    if (offset !== null) targetFrames.push({ type: 'Offset', frame: offset });

    if (targetFrames.length === 0) {
      this.app.showWarning('No annotation frames (Onset/Apex/Offset) set yet.');
      return;
    }

    const format = this.getSelectedFormat();
    this.app.setStatus(`Batch cropping ${targetFrames.length} annotation frames...`, 'working');
    if (this.dom.applyAllBtn) this.dom.applyAllBtn.disabled = true;

    try {
      let succeeded = 0;
      for (const item of targetFrames) {
        await api.applyCrop({
          video_id: this.app.currentVideoId,
          frame_number: item.frame,
          x: Math.round(this.crop.x),
          y: Math.round(this.crop.y),
          width: Math.round(this.crop.width),
          height: Math.round(this.crop.height),
          participant_id: this.app.clipExtractor ? this.app.clipExtractor.dom.clipParticipantId.value : '',
          video_label: this.app.clipExtractor ? this.app.clipExtractor.dom.clipVideoLabel.value : '',
          format
        });
        succeeded++;
      }

      this.app.showSuccess(`Cropped ${succeeded} annotation frame(s) successfully!`);
      this.app.setStatus('Batch crop finished.', 'ready');

      if (this.dom.cropStatusAlert && this.dom.cropStatusText) {
        this.dom.cropStatusAlert.className = 'validation-alert success';
        this.dom.cropStatusText.textContent = `Batch cropped ${succeeded} frame(s): ${targetFrames.map(t => `${t.type} (${t.frame})`).join(', ')}`;
        this.dom.cropStatusAlert.classList.remove('hidden');
      }
    } catch (err) {
      this.app.showError(`Batch crop failed: ${err.message}`);
      this.app.setStatus('Batch crop failed.', 'error');
    } finally {
      if (this.dom.applyAllBtn) this.dom.applyAllBtn.disabled = false;
    }
  }
}

// Global attachment
window.CropTool = CropTool;
