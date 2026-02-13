/**
 * Frame Exporter - WebM Video Recording
 * Records video when enabled via URL params: ?record=true&start_time=20&end_time=40
 * Uses MediaRecorder API for efficient video capture (avoids memory overflow)
 */

import * as THREE from 'three';

// ============================================================================
// Configuration
// ============================================================================
const EXPORT_CONFIG = {
  fps: 24,                    // Frame rate
  startTimeSeconds: 20,       // Start recording at this simulation time
  endTimeSeconds: 40,         // Stop recording at this simulation time
  durationSeconds: 20,        // Duration (auto-calculated from start/end)
  totalFrames: 480,           // Total frames (auto-calculated)
  format: 'webm',             // Output format
  videoBitrate: 10000000,     // 10 Mbps for high quality
  name: 'simulation',         // Output filename prefix
};

// ============================================================================
// State
// ============================================================================
let isRecording = false;
let isWaitingToStart = false;
let currentFrame = 0;
let recordingStartTime = 0;
let frameInterval = 1000 / EXPORT_CONFIG.fps;
let lastFrameTime = 0;

// MediaRecorder for WebM
let mediaRecorder = null;
let recordedChunks = [];
let canvasStream = null;

// References to Three.js objects
let scene = null;
let camera = null;
let renderer = null;
let getSimTimeFn = null;

// ============================================================================
// Configuration Update
// ============================================================================

/**
 * Update export configuration
 * @param {Object} config - Configuration object
 */
export function setExportConfig(config) {
  Object.assign(EXPORT_CONFIG, config);
  
  // Auto-calculate duration and totalFrames if start/end provided
  if (config.startTimeSeconds !== undefined && config.endTimeSeconds !== undefined) {
    EXPORT_CONFIG.durationSeconds = EXPORT_CONFIG.endTimeSeconds - EXPORT_CONFIG.startTimeSeconds;
    EXPORT_CONFIG.totalFrames = Math.ceil(EXPORT_CONFIG.durationSeconds * EXPORT_CONFIG.fps);
  }
  
  frameInterval = 1000 / EXPORT_CONFIG.fps;
  console.log('🎬 Export config updated:', EXPORT_CONFIG);
}

/**
 * Get current export configuration
 */
export function getExportConfig() {
  return { ...EXPORT_CONFIG };
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the frame exporter
 * @param {THREE.Scene} sceneRef - The Three.js scene
 * @param {THREE.Camera} cameraRef - The camera
 * @param {THREE.WebGLRenderer} rendererRef - The renderer
 * @param {Function} simTimeFn - Function that returns current simulation time in seconds
 */
export function initFrameExporter(sceneRef, cameraRef, rendererRef, simTimeFn) {
  scene = sceneRef;
  camera = cameraRef;
  renderer = rendererRef;
  getSimTimeFn = simTimeFn;

  console.log('');
  console.log('🎬 ═══════════════════════════════════════════════════════════');
  console.log('🎬 Video Recorder initialized');
  console.log(`🎬   Format: ${EXPORT_CONFIG.format.toUpperCase()}`);
  console.log(`🎬   FPS: ${EXPORT_CONFIG.fps}`);
  console.log(`🎬   Start time: ${EXPORT_CONFIG.startTimeSeconds}s`);
  console.log(`🎬   End time: ${EXPORT_CONFIG.endTimeSeconds}s`);
  console.log(`🎬   Duration: ${EXPORT_CONFIG.durationSeconds}s (${EXPORT_CONFIG.totalFrames} frames)`);
  console.log(`🎬   Bitrate: ${(EXPORT_CONFIG.videoBitrate / 1000000).toFixed(1)} Mbps`);
  console.log('🎬 ═══════════════════════════════════════════════════════════');
  console.log('');

  // Auto-start waiting for recording
  startWaitingForRecording();
}

// ============================================================================
// Auto-start Logic
// ============================================================================

/**
 * Start waiting for the simulation to reach the recording start time
 */
function startWaitingForRecording() {
  if (isWaitingToStart || isRecording) return;
  
  isWaitingToStart = true;
  console.log(`⏳ [WAITING] Waiting for simulation to reach t=${EXPORT_CONFIG.startTimeSeconds}s...`);
  
  let lastLogTime = -5;
  
  const checkInterval = setInterval(() => {
    if (!isWaitingToStart) {
      clearInterval(checkInterval);
      return;
    }
    
    const simTime = getSimTimeFn ? getSimTimeFn() : 0;
    
    // Log progress every 5 seconds
    if (simTime - lastLogTime >= 5) {
      lastLogTime = simTime;
      const remaining = Math.max(0, EXPORT_CONFIG.startTimeSeconds - simTime);
      if (remaining > 0) {
        console.log(`⏳ [WAITING] Current time: ${simTime.toFixed(1)}s, recording starts in ${remaining.toFixed(1)}s`);
      }
    }
    
    // Start recording when we reach the target time
    if (simTime >= EXPORT_CONFIG.startTimeSeconds) {
      clearInterval(checkInterval);
      isWaitingToStart = false;
      startRecording();
    }
  }, 100);
}

// ============================================================================
// Recording Control
// ============================================================================

/**
 * Start recording video
 */
function startRecording() {
  if (isRecording) {
    console.warn('⚠️ Recording already in progress');
    return;
  }

  // Get canvas stream
  const canvas = renderer.domElement;
  canvasStream = canvas.captureStream(EXPORT_CONFIG.fps);
  
  // Initialize MediaRecorder
  const options = {
    mimeType: 'video/webm;codecs=vp9',
    videoBitsPerSecond: EXPORT_CONFIG.videoBitrate,
  };
  
  // Fallback if VP9 is not supported
  if (!MediaRecorder.isTypeSupported(options.mimeType)) {
    options.mimeType = 'video/webm;codecs=vp8';
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options.mimeType = 'video/webm';
    }
  }
  
  console.log(`🎥 Using codec: ${options.mimeType}`);
  
  recordedChunks = [];
  mediaRecorder = new MediaRecorder(canvasStream, options);
  
  mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      recordedChunks.push(event.data);
    }
  };
  
  mediaRecorder.onstop = () => {
    saveRecording();
  };
  
  mediaRecorder.onerror = (event) => {
    console.error('❌ MediaRecorder error:', event.error);
  };

  isRecording = true;
  currentFrame = 0;
  recordingStartTime = performance.now();
  lastFrameTime = recordingStartTime;
  
  // Start recording - request data every second
  mediaRecorder.start(1000);

  console.log('');
  console.log('🔴 ═══════════════════════════════════════════════════════════');
  console.log('🔴 [RECORDING] Started video recording!');
  console.log(`🔴 [RECORDING] Recording from ${EXPORT_CONFIG.startTimeSeconds}s to ${EXPORT_CONFIG.endTimeSeconds}s`);
  console.log(`🔴 [RECORDING] Duration: ${EXPORT_CONFIG.durationSeconds}s at ${EXPORT_CONFIG.fps}fps`);
  console.log('🔴 ═══════════════════════════════════════════════════════════');
  console.log('');
}

/**
 * Stop recording
 */
function stopRecording() {
  if (!isRecording) return;

  isRecording = false;
  
  const elapsedMs = performance.now() - recordingStartTime;
  const elapsedSec = (elapsedMs / 1000).toFixed(1);

  console.log('');
  console.log('⏹️ ═══════════════════════════════════════════════════════════');
  console.log(`⏹️ [RECORDING] Stopped at frame ${currentFrame}`);
  console.log(`⏹️ [RECORDING] Recording time: ${elapsedSec}s`);
  console.log('⏹️ ═══════════════════════════════════════════════════════════');
  
  // Stop MediaRecorder (will trigger onstop -> saveRecording)
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
}

/**
 * Save the recorded video
 */
function saveRecording() {
  console.log('');
  console.log('📦 ═══════════════════════════════════════════════════════════');
  console.log('📦 [EXPORTING] Generating video file...');
  console.log('📦 ═══════════════════════════════════════════════════════════');

  try {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    // Filename includes start_time and end_time
    const startStr = String(EXPORT_CONFIG.startTimeSeconds).padStart(3, '0');
    const endStr = String(EXPORT_CONFIG.endTimeSeconds).padStart(3, '0');
    link.download = `${EXPORT_CONFIG.name}_${startStr}s_to_${endStr}s.webm`;
    link.href = url;
    link.click();
    
    // Clean up
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);

    const fileSizeMB = (blob.size / (1024 * 1024)).toFixed(2);

    console.log('');
    console.log('✅ ═══════════════════════════════════════════════════════════');
    console.log('✅ [COMPLETE] Video saved successfully!');
    console.log(`✅ [COMPLETE] Time range: ${EXPORT_CONFIG.startTimeSeconds}s - ${EXPORT_CONFIG.endTimeSeconds}s`);
    console.log(`✅ [COMPLETE] Duration: ${EXPORT_CONFIG.durationSeconds}s`);
    console.log(`✅ [COMPLETE] File size: ${fileSizeMB} MB`);
    console.log(`✅ [COMPLETE] Filename: ${link.download}`);
    console.log('✅ ═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('💡 To convert to image sequence with FFmpeg:');
    console.log(`   ffmpeg -i "${link.download}" -vf fps=${EXPORT_CONFIG.fps} frame_%05d.png`);
    console.log('');

    // Clear recorded chunks
    recordedChunks = [];

  } catch (error) {
    console.error('❌ [ERROR] Failed to save video:', error);
  }
}

// ============================================================================
// Frame Counter (call this in animation loop)
// ============================================================================

/**
 * Update frame counter and check if recording should stop
 * Call this AFTER renderer.render() in your animation loop
 * @returns {boolean} - Whether recording is active
 */
export function captureFrame() {
  if (!isRecording) return false;

  // Check if enough time has passed for next frame
  const now = performance.now();
  const elapsed = now - lastFrameTime;
  
  if (elapsed < frameInterval) return true;
  
  lastFrameTime = now;
  currentFrame++;

  // Log progress every second of video
  if (currentFrame % EXPORT_CONFIG.fps === 0) {
    const progress = ((currentFrame / EXPORT_CONFIG.totalFrames) * 100).toFixed(1);
    const secondsRecorded = currentFrame / EXPORT_CONFIG.fps;
    const currentSimTime = EXPORT_CONFIG.startTimeSeconds + secondsRecorded;
    console.log(`🔴 [RECORDING] t=${currentSimTime.toFixed(0)}s | ${secondsRecorded}s / ${EXPORT_CONFIG.durationSeconds}s (${progress}%)`);
  }

  // Check if we've reached the target duration
  if (currentFrame >= EXPORT_CONFIG.totalFrames) {
    stopRecording();
    return false;
  }

  return true;
}

// ============================================================================
// Manual Controls
// ============================================================================

/**
 * Manually start recording
 */
export function startExport() {
  if (isWaitingToStart) {
    isWaitingToStart = false;
  }
  startRecording();
}

/**
 * Manually stop recording
 */
export function stopExport() {
  if (isWaitingToStart) {
    isWaitingToStart = false;
    console.log('⏹️ Cancelled waiting for recording start');
    return;
  }
  stopRecording();
}

/**
 * Get current export status
 */
export function getExportStatus() {
  return {
    isWaitingToStart,
    isRecording,
    currentFrame,
    totalFrames: EXPORT_CONFIG.totalFrames,
    progress: isRecording ? ((currentFrame / EXPORT_CONFIG.totalFrames) * 100).toFixed(1) : 0,
  };
}

export { EXPORT_CONFIG };
