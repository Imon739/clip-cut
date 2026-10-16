/**
 * Micro-Expression Video Annotation & Clip Extractor
 * File 6: frontend/js/annotations.js
 * Annotation Controls: Onset, Apex, and Offset Boundary Marking & Scientific Validation
 */

class AnnotationPanel {
  /**
   * @param {App} app - Main app instance reference
   */
  constructor(app) {
    this.app = app;

    // Cache elements
    this.dom = {
      // Onset
      onsetCard: document.getElementById('onsetCard'),
      setOnsetBtn: document.getElementById('setOnsetBtn'),
      goToOnsetBtn: document.getElementById('goToOnsetBtn'),
      clearOnsetBtn: document.getElementById('clearOnsetBtn'),
      onsetFrameInput: document.getElementById('onsetFrameInput'),
      onsetTimestampDisplay: document.getElementById('onsetTimestampDisplay'),
      onsetStatusBadge: document.getElementById('onsetStatusBadge'),

      // Apex
      apexCard: document.getElementById('apexCard'),
      setApexBtn: document.getElementById('setApexBtn'),
      goToApexBtn: document.getElementById('goToApexBtn'),
      clearApexBtn: document.getElementById('clearApexBtn'),
      apexFrameInput: document.getElementById('apexFrameInput'),
      apexTimestampDisplay: document.getElementById('apexTimestampDisplay'),
      apexStatusBadge: document.getElementById('apexStatusBadge'),

      // Offset
      offsetCard: document.getElementById('offsetCard'),
      setOffsetBtn: document.getElementById('setOffsetBtn'),
      goToOffsetBtn: document.getElementById('goToOffsetBtn'),
      clearOffsetBtn: document.getElementById('clearOffsetBtn'),
      offsetFrameInput: document.getElementById('offsetFrameInput'),
      offsetTimestampDisplay: document.getElementById('offsetTimestampDisplay'),
      offsetStatusBadge: document.getElementById('offsetStatusBadge'),

      // Metrics & Validation
      metricDurationFrames: document.getElementById('metricDurationFrames'),
      metricDurationMs: document.getElementById('metricDurationMs'),
      metricOnsetApex: document.getElementById('metricOnsetApex'),
      metricApexOffset: document.getElementById('metricApexOffset'),
      validationAlert: document.getElementById('annotationValidationAlert'),
      validationMsg: document.getElementById('annotationValidationMsg'),

      // Actions
      saveAnnotationsBtn: document.getElementById('saveAnnotationsBtn'),
      loadAnnotationsBtn: document.getElementById('loadAnnotationsBtn'),
      clearAllAnnotationsBtn: document.getElementById('clearAllAnnotationsBtn')
    };

    this.bindEvents();
  }

  /**
   * Bind buttons, inputs, and actions
   */
  bindEvents() {
    // Set buttons
    if (this.dom.setOnsetBtn) {
      this.dom.setOnsetBtn.addEventListener('click', () => this.setOnset());
    }
    if (this.dom.setApexBtn) {
      this.dom.setApexBtn.addEventListener('click', () => this.setApex());
    }
    if (this.dom.setOffsetBtn) {
      this.dom.setOffsetBtn.addEventListener('click', () => this.setOffset());
    }

    // Go-to frame buttons
    if (this.dom.goToOnsetBtn) {
      this.dom.goToOnsetBtn.addEventListener('click', () => {
        if (this.app.annotation.onset !== null) {
          this.app.videoPlayer.goToFrame(this.app.annotation.onset);
        }
      });
    }
    if (this.dom.goToApexBtn) {
      this.dom.goToApexBtn.addEventListener('click', () => {
        if (this.app.annotation.apex !== null) {
          this.app.videoPlayer.goToFrame(this.app.annotation.apex);
        }
      });
    }
    if (this.dom.goToOffsetBtn) {
      this.dom.goToOffsetBtn.addEventListener('click', () => {
        if (this.app.annotation.offset !== null) {
          this.app.videoPlayer.goToFrame(this.app.annotation.offset);
        }
      });
    }

    // Clear individual buttons
    if (this.dom.clearOnsetBtn) {
      this.dom.clearOnsetBtn.addEventListener('click', () => this.clearPoint('onset'));
    }
    if (this.dom.clearApexBtn) {
      this.dom.clearApexBtn.addEventListener('click', () => this.clearPoint('apex'));
    }
    if (this.dom.clearOffsetBtn) {
      this.dom.clearOffsetBtn.addEventListener('click', () => this.clearPoint('offset'));
    }

    // Direct input editing
    this.setupDirectInput(this.dom.onsetFrameInput, 'onset');
    this.setupDirectInput(this.dom.apexFrameInput, 'apex');
    this.setupDirectInput(this.dom.offsetFrameInput, 'offset');

    // Action buttons
    if (this.dom.saveAnnotationsBtn) {
      this.dom.saveAnnotationsBtn.addEventListener('click', () => this.saveAnnotations());
    }
    if (this.dom.loadAnnotationsBtn) {
      this.dom.loadAnnotationsBtn.addEventListener('click', () => this.loadAnnotations());
    }
    if (this.dom.clearAllAnnotationsBtn) {
      this.dom.clearAllAnnotationsBtn.addEventListener('click', () => this.clearAll());
    }
  }

  /**
   * Helper for editable frame inputs
   */
  setupDirectInput(inputEl, pointType) {
    if (!inputEl) return;

    inputEl.addEventListener('change', (e) => {
      const val = e.target.value.trim();
      if (val === '') {
        this.clearPoint(pointType);
      } else {
        const parsed = parseInt(val, 10);
        if (!isNaN(parsed) && parsed >= 0) {
          if (pointType === 'onset') this.setOnset(parsed);
          else if (pointType === 'apex') this.setApex(parsed);
          else if (pointType === 'offset') this.setOffset(parsed);
        } else {
          e.target.value = this.app.annotation[pointType] !== null ? this.app.annotation[pointType] : '';
        }
      }
    });

    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        inputEl.blur();
      }
    });
  }

  /**
   * Called when new video is loaded
   */
  onVideoLoaded() {
    this.dom.saveAnnotationsBtn.disabled = false;
    this.dom.loadAnnotationsBtn.disabled = false;
    this.dom.clearAllAnnotationsBtn.disabled = false;
    this.renderAnnotations(this.app.annotation);
  }

  /**
   * Set onset frame
   */
  setOnset(frame = null) {
    const target = frame !== null ? frame : this.app.currentFrame;
    this.app.setAnnotationData(target, this.app.annotation.apex, this.app.annotation.offset, false);
    this.app.showInfo(`Onset set to frame ${target}`);
  }

  /**
   * Set apex frame
   */
  setApex(frame = null) {
    const target = frame !== null ? frame : this.app.currentFrame;
    this.app.setAnnotationData(this.app.annotation.onset, target, this.app.annotation.offset, false);
    this.app.showInfo(`Apex set to frame ${target}`);
  }

  /**
   * Set offset frame
   */
  setOffset(frame = null) {
    const target = frame !== null ? frame : this.app.currentFrame;
    this.app.setAnnotationData(this.app.annotation.onset, this.app.annotation.apex, target, false);
    this.app.showInfo(`Offset set to frame ${target}`);
  }

  /**
   * Clear single annotation point
   */
  clearPoint(pointType) {
    const copy = { ...this.app.annotation };
    copy[pointType] = null;
    this.app.setAnnotationData(copy.onset, copy.apex, copy.offset, false);
  }

  /**
   * Clear all annotation points
   */
  clearAll() {
    this.app.setAnnotationData(null, null, null, false);
    this.app.showInfo('All annotations cleared.');
  }

  /**
   * Save annotations to backend
   */
  async saveAnnotations() {
    const { onset, apex, offset } = this.app.annotation;

    if (onset === null && apex === null && offset === null) {
      this.app.showWarning('No annotations set to save.');
      return;
    }

    const validation = this.validateAnnotations(onset, apex, offset);
    if (!validation.isValid && validation.isStrictError) {
      this.app.showError(`Cannot save invalid annotations: ${validation.message}`);
      return;
    }

    await this.app.saveAnnotationsToBackend();
  }

  /**
   * Load existing annotations from backend
   */
  async loadAnnotations() {
    if (!this.app.currentVideoId) return;
    try {
      this.app.setStatus('Loading annotations from backend...', 'working');
      const data = await api.getAnnotation(this.app.currentVideoId);
      if (data) {
        this.app.setAnnotationData(data.onset_frame, data.apex_frame, data.offset_frame, false);
        this.app.showSuccess('Annotations loaded from backend.');
        this.app.setStatus('Annotations loaded.', 'ready');
      } else {
        this.app.showInfo('No existing annotations found on backend.');
        this.app.setStatus('Ready.', 'ready');
      }
    } catch (err) {
      this.app.showError(`Failed to load annotations: ${err.message}`);
      this.app.setStatus('Failed to load annotations.', 'error');
    }
  }

  /**
   * Validate micro-expression boundary ordering:
   * Condition: onset < apex < offset
   */
  validateAnnotations(onset, apex, offset) {
    // If not all 3 set yet
    const setList = [onset, apex, offset].filter(v => v !== null);
    if (setList.length < 3) {
      // Partial check
      if (onset !== null && apex !== null && onset >= apex) {
        return { isValid: false, isStrictError: true, message: `Violation: Onset (${onset}) must be strictly before Apex (${apex})` };
      }
      if (apex !== null && offset !== null && apex >= offset) {
        return { isValid: false, isStrictError: true, message: `Violation: Apex (${apex}) must be strictly before Offset (${offset})` };
      }
      if (onset !== null && offset !== null && onset >= offset) {
        return { isValid: false, isStrictError: true, message: `Violation: Onset (${onset}) must be strictly before Offset (${offset})` };
      }
      return {
        isValid: false,
        isStrictError: false,
        message: `Mark ${3 - setList.length} more point(s) to complete micro-expression interval.`
      };
    }

    // All three set: check onset < apex < offset
    if (onset >= apex) {
      return {
        isValid: false,
        isStrictError: true,
        message: `Order Violation: Onset (${onset}) must be before Apex (${apex})`
      };
    }
    if (apex >= offset) {
      return {
        isValid: false,
        isStrictError: true,
        message: `Order Violation: Apex (${apex}) must be before Offset (${offset})`
      };
    }

    // Compute duration
    const fps = this.app.fps || 30.0;
    const durationFrames = offset - onset + 1;
    const durationMs = (durationFrames / fps) * 1000;

    let warning = '';
    if (durationMs > 500) {
      warning = ` (Notice: ${Math.round(durationMs)}ms exceeds typical 500ms micro-expression threshold - may be macro-expression)`;
    }

    return {
      isValid: true,
      isStrictError: false,
      durationFrames,
      durationMs,
      message: `Valid Micro-Expression boundaries: ${durationFrames} frames (${Math.round(durationMs)} ms)${warning}`
    };
  }

  /**
   * Render updated annotations into the DOM
   */
  renderAnnotations(annotation) {
    const { onset, apex, offset } = annotation;
    const fps = this.app.fps || 30.0;

    // 1. Update Onset UI
    const onsetSet = onset !== null;
    this.dom.onsetFrameInput.value = onsetSet ? onset : '';
    this.dom.onsetTimestampDisplay.textContent = onsetSet ? this.app.formatTimestamp(onset, fps) : '-';
    this.dom.onsetStatusBadge.textContent = onsetSet ? `Frame ${onset}` : 'Unset';
    this.dom.onsetStatusBadge.className = `status-pill ${onsetSet ? 'set' : 'unset'}`;
    this.dom.goToOnsetBtn.disabled = !onsetSet;
    this.dom.clearOnsetBtn.disabled = !onsetSet;

    // 2. Update Apex UI
    const apexSet = apex !== null;
    this.dom.apexFrameInput.value = apexSet ? apex : '';
    this.dom.apexTimestampDisplay.textContent = apexSet ? this.app.formatTimestamp(apex, fps) : '-';
    this.dom.apexStatusBadge.textContent = apexSet ? `Frame ${apex}` : 'Unset';
    this.dom.apexStatusBadge.className = `status-pill ${apexSet ? 'set' : 'unset'}`;
    this.dom.goToApexBtn.disabled = !apexSet;
    this.dom.clearApexBtn.disabled = !apexSet;

    // 3. Update Offset UI
    const offsetSet = offset !== null;
    this.dom.offsetFrameInput.value = offsetSet ? offset : '';
    this.dom.offsetTimestampDisplay.textContent = offsetSet ? this.app.formatTimestamp(offset, fps) : '-';
    this.dom.offsetStatusBadge.textContent = offsetSet ? `Frame ${offset}` : 'Unset';
    this.dom.offsetStatusBadge.className = `status-pill ${offsetSet ? 'set' : 'unset'}`;
    this.dom.goToOffsetBtn.disabled = !offsetSet;
    this.dom.clearOffsetBtn.disabled = !offsetSet;

    // 4. Update Metrics
    if (onsetSet && offsetSet && onset <= offset) {
      const durFrames = offset - onset + 1;
      const durMs = (durFrames / fps) * 1000;
      this.dom.metricDurationFrames.textContent = `${durFrames} frames`;
      this.dom.metricDurationMs.textContent = `(${Math.round(durMs)} ms)`;
    } else {
      this.dom.metricDurationFrames.textContent = '- frames';
      this.dom.metricDurationMs.textContent = '(- ms)';
    }

    if (onsetSet && apexSet && onset <= apex) {
      this.dom.metricOnsetApex.textContent = `${apex - onset} frames`;
    } else {
      this.dom.metricOnsetApex.textContent = '- frames';
    }

    if (apexSet && offsetSet && apex <= offset) {
      this.dom.metricApexOffset.textContent = `${offset - apex} frames`;
    } else {
      this.dom.metricApexOffset.textContent = '- frames';
    }

    // 5. Update Validation Notice
    const validation = this.validateAnnotations(onset, apex, offset);
    this.dom.validationMsg.textContent = validation.message;

    if (validation.isStrictError) {
      this.dom.validationAlert.className = 'validation-alert error';
    } else if (validation.isValid) {
      if (validation.durationMs > 500) {
        this.dom.validationAlert.className = 'validation-alert warning';
      } else {
        this.dom.validationAlert.className = 'validation-alert success';
      }
    } else {
      this.dom.validationAlert.className = 'validation-alert info';
    }
  }
}

// Global attachment
window.AnnotationPanel = AnnotationPanel;
