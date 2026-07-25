/* ===================================================
   Whisper STT — Frontend Logic
   Calls: POST http://localhost:8010/transcribe?prompt=...
   with Content-Type: audio/<format> and raw binary body
=================================================== */

const API_BASE = 'http://localhost:8010/transcribe';

// ── DOM refs ──────────────────────────────────────
const dropZone      = document.getElementById('dropZone');
const fileInput     = document.getElementById('fileInput');
const filePreview   = document.getElementById('filePreview');
const fileName      = document.getElementById('fileName');
const fileSize      = document.getElementById('fileSize');
const removeFile    = document.getElementById('removeFile');
const audioPlayer   = document.getElementById('audioPlayer');
const promptInput   = document.getElementById('promptInput');
const transcribeBtn = document.getElementById('transcribeBtn');
const btnLoader     = document.getElementById('btnLoader');
const btnText       = document.querySelector('#transcribeBtn .btn-text');
const btnIcon       = document.querySelector('#transcribeBtn .btn-icon');

const translateBtn    = document.getElementById('translateBtn');
const translateLoader = document.getElementById('translateLoader');
const translateText   = document.querySelector('#translateBtn .btn-text');
const translateIcon   = document.querySelector('#translateBtn .btn-icon');

const resultsContainer = document.getElementById('resultsContainer');
const resultTemplate = document.getElementById('resultTemplate');
const errorCard     = document.getElementById('errorCard');
const errorMessage  = document.getElementById('errorMessage');
const errorClose    = document.getElementById('errorClose');
const resampleToggle = document.getElementById('resampleToggle');

let selectedFile = null;

// ── Drag & Drop ───────────────────────────────────
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', (e) => {
  if (!dropZone.contains(e.relatedTarget)) {
    dropZone.classList.remove('drag-over');
  }
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('audio/')) {
    setFile(file);
  } else {
    showError('Please drop a valid audio file (WAV, MP3, M4A, etc.)');
  }
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) setFile(fileInput.files[0]);
});

// ── File Handling ─────────────────────────────────
function setFile(file) {
  selectedFile = file;
  hideError();
  resultsContainer.innerHTML = ''; // clear previous results on new file

  // Update preview
  fileName.textContent = file.name;
  fileSize.textContent = formatBytes(file.size);

  // Audio preview
  const objectUrl = URL.createObjectURL(file);
  audioPlayer.src = objectUrl;

  // Show preview, hide drop zone
  filePreview.classList.remove('hidden');
  dropZone.style.display = 'none';

  // Enable button
  transcribeBtn.disabled = false;
  translateBtn.disabled = false;
}

removeFile.addEventListener('click', () => {
  clearFile();
});

function clearFile() {
  selectedFile = null;
  fileInput.value = '';
  audioPlayer.src = '';
  filePreview.classList.add('hidden');
  dropZone.style.display = '';
  transcribeBtn.disabled = true;
  translateBtn.disabled = true;
  resultsContainer.innerHTML = '';
  hideError();
}

async function processAudio(endpoint, btn, txtElem, iconElem, loaderElem, loadingText, originalText, resultTitle) {
  if (!selectedFile) return;

  setLoading(true, btn, txtElem, iconElem, loaderElem, loadingText, originalText);
  hideError();

  try {
    const prompt = promptInput.value.trim();
    const url = prompt
      ? `${endpoint}?prompt=${encodeURIComponent(prompt)}`
      : endpoint;

    let body;
    let contentType;
    let uploadSize;

    if (resampleToggle.checked) {
      // Resample to 16kHz mono WAV via Web Audio API
      txtElem.textContent = 'Resampling…';
      const rawBuffer = await readFileAsArrayBuffer(selectedFile);
      const wavBuffer = await resampleTo16kHz(rawBuffer);
      body = wavBuffer;
      contentType = 'audio/wav';
      uploadSize = wavBuffer.byteLength;
    } else {
      body = await readFileAsArrayBuffer(selectedFile);
      contentType = getAudioContentType(selectedFile);
      uploadSize = selectedFile.size;
    }

    txtElem.textContent = loadingText;
    const startTime = Date.now();

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown server error');
      throw new Error(`HTTP ${response.status}: ${errText}`);
    }

    // Try parsing as JSON first, fall back to raw text
    let text = '';
    const contentTypeRes = response.headers.get('content-type') || '';

    if (contentTypeRes.includes('application/json')) {
      const json = await response.json();
      // Support common Whisper response shapes
      text = json.text ?? json.transcription ?? json.result ?? JSON.stringify(json, null, 2);
    } else {
      text = await response.text();
    }

    const resampledNote = resampleToggle.checked ? '  ·  resampled to 16 kHz' : '';
    showResult(text.trim(), {
      elapsed,
      file: selectedFile.name,
      size: formatBytes(uploadSize),
      resampledNote,
    }, resultTitle);

  } catch (err) {
    console.error('Transcription error:', err);

    if (err.name === 'TypeError' && err.message.includes('Failed to fetch')) {
      showError('Cannot reach the API server at localhost:8010. Make sure the Whisper server is running.');
    } else {
      showError(err.message || 'An unexpected error occurred.');
    }
  } finally {
    setLoading(false, btn, txtElem, iconElem, loaderElem, loadingText, originalText);
  }
}

transcribeBtn.addEventListener('click', () => {
  processAudio(API_BASE, transcribeBtn, btnText, btnIcon, btnLoader, 'Transcribing…', 'Transcribe Audio', 'Transcription');
});

translateBtn.addEventListener('click', () => {
  const TRANSLATE_URL = API_BASE.replace('/transcribe', '/translate');
  processAudio(TRANSLATE_URL, translateBtn, translateText, translateIcon, translateLoader, 'Translating…', 'Translate (to EN)', 'Translation (to EN)');
});

// ── UI Helpers ────────────────────────────────────
function setLoading(loading, btn, txtElem, iconElem, loaderElem, loadingText, originalText) {
  transcribeBtn.disabled = loading;
  translateBtn.disabled = loading;

  if (loading) {
    iconElem.classList.add('hidden');
    txtElem.textContent = loadingText;
    loaderElem.classList.remove('hidden');
  } else {
    iconElem.classList.remove('hidden');
    txtElem.textContent = originalText;
    loaderElem.classList.add('hidden');
    // Re-enable only if file still selected
    transcribeBtn.disabled = !selectedFile;
    translateBtn.disabled = !selectedFile;
  }
}

function showResult(text, meta, title) {
  const clone = resultTemplate.content.cloneNode(true);
  const card = clone.querySelector('.result-card');
  const titleElem = clone.querySelector('.result-title');
  const metaElem = clone.querySelector('.result-meta');
  const textElem = clone.querySelector('.transcription-text');
  const copyBtn = clone.querySelector('.copyBtn');
  const downloadBtn = clone.querySelector('.downloadBtn');

  titleElem.textContent = title;
  textElem.textContent = text;
  metaElem.textContent = `✓  Completed in ${meta.elapsed}s  ·  ${meta.file}  ·  ${meta.size}${meta.resampledNote}`;

  // Local Copy handler
  copyBtn.addEventListener('click', async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      copyBtn.classList.add('success');
      const span = copyBtn.querySelector('span:last-child');
      const originalText = span.textContent;
      span.textContent = 'Copied!';
      setTimeout(() => {
        copyBtn.classList.remove('success');
        span.textContent = originalText;
      }, 2000);
    } catch {
      showError('Could not copy to clipboard. Please select and copy manually.');
    }
  });

  // Local Download handler
  downloadBtn.addEventListener('click', () => {
    if (!text) return;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const baseName = (selectedFile?.name || 'audio').replace(/\.[^.]+$/, '');
    const suffix = title.toLowerCase().includes('translate') ? 'translation' : 'transcription';
    a.href = url;
    a.download = `${baseName}_${suffix}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  });

  resultsContainer.prepend(card);
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function showError(msg) {
  errorMessage.textContent = msg;
  errorCard.classList.remove('hidden');
}

function hideError() {
  errorCard.classList.add('hidden');
}

errorClose.addEventListener('click', hideError);

// ── Utilities ─────────────────────────────────────
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

function getAudioContentType(file) {
  // Use explicit MIME type if available, or infer from extension
  if (file.type && file.type.startsWith('audio/')) return file.type;

  const ext = file.name.split('.').pop()?.toLowerCase();
  const map = {
    wav:  'audio/wav',
    mp3:  'audio/mpeg',
    m4a:  'audio/mp4',
    ogg:  'audio/ogg',
    flac: 'audio/flac',
    webm: 'audio/webm',
    aac:  'audio/aac',
  };
  return map[ext] ?? 'audio/wav';
}

// ── 16 kHz Resampling ─────────────────────────────
/**
 * Decodes any audio format the browser supports, resamples to 16kHz mono,
 * and returns a WAV-encoded ArrayBuffer ready to POST.
 */
async function resampleTo16kHz(arrayBuffer) {
  const TARGET_SR = 16000;

  // Decode with the browser's native AudioContext at its default sample rate
  const decodeCtx = new AudioContext();
  let decoded;
  try {
    decoded = await decodeCtx.decodeAudioData(arrayBuffer);
  } finally {
    decodeCtx.close();
  }

  if (decoded.sampleRate === TARGET_SR && decoded.numberOfChannels === 1) {
    // Already 16kHz mono — just WAV-encode as-is
    return encodeWAV(decoded.getChannelData(0), TARGET_SR);
  }

  // Offline context resamples in one pass
  const numFrames = Math.round(decoded.duration * TARGET_SR);
  const offlineCtx = new OfflineAudioContext(1, numFrames, TARGET_SR);

  const src = offlineCtx.createBufferSource();
  src.buffer = decoded;
  src.connect(offlineCtx.destination);
  src.start(0);

  const resampled = await offlineCtx.startRendering();
  return encodeWAV(resampled.getChannelData(0), TARGET_SR);
}

/**
 * Encodes a Float32Array of PCM samples into a 16-bit PCM WAV ArrayBuffer.
 */
function encodeWAV(samples, sampleRate) {
  const numSamples = samples.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  function writeStr(offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeStr(0,  'RIFF');
  view.setUint32(4,  36 + numSamples * 2, true); // file size - 8
  writeStr(8,  'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);           // PCM chunk size
  view.setUint16(20, 1,  true);           // PCM format
  view.setUint16(22, 1,  true);           // mono
  view.setUint32(24, sampleRate, true);   // sample rate
  view.setUint32(28, sampleRate * 2, true); // byte rate (SR * channels * bitsPerSample/8)
  view.setUint16(32, 2,  true);           // block align
  view.setUint16(34, 16, true);           // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  // Convert float32 → int16
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return buffer;
}
