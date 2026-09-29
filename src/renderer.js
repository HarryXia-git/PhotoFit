import * as pdfjsLib from '../node_modules/pdfjs-dist/build/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../node_modules/pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();

const state = { files: [], outputDir: null, lastOutput: null, processing: false };
const $ = (selector) => document.querySelector(selector);
const dropzone = $('#dropzone');
const fileInput = $('#fileInput');
const fileList = $('#fileList');
const targetInput = $('#targetSize');

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileType(file) {
  const extension = file.name.split('.').pop().toLowerCase();
  return extension === 'pdf' ? 'PDF' : extension.toUpperCase() || 'FILE';
}

function addFiles(fileListLike) {
  const incoming = Array.from(fileListLike || []);
  for (const file of incoming) {
    const filePath = window.zippping.pathForFile(file);
    if (!filePath || state.files.some((item) => item.path === filePath)) continue;
    const extension = file.name.split('.').pop().toLowerCase();
    const supported = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'heic', 'heif', 'avif', 'pdf'].includes(extension);
    if (!supported) continue;
    state.files.push({ id: crypto.randomUUID(), file, path: filePath, type: extension, status: '等待处理' });
  }
  renderQueue();
}

function removeFile(id) {
  if (state.processing) return;
  state.files = state.files.filter((item) => item.id !== id);
  renderQueue();
}

function renderQueue() {
  $('#queueCount').textContent = state.files.length;
  $('#queueTitle').textContent = state.files.length ? `${state.files.length} 个文件准备就绪` : '还没有添加文件';
  $('#clearButton').disabled = !state.files.length || state.processing;
  $('#startButton').disabled = !state.files.length || state.processing;
  if (!state.files.length) {
    fileList.innerHTML = '<div class="empty-state"><div class="empty-mark">＋</div><span>添加文件后，它们会出现在这里</span></div>';
    return;
  }
  fileList.innerHTML = state.files.map((item) => {
    const isPdf = item.type === 'pdf';
    const statusClass = item.status === '完成' ? 'success' : item.status === '失败' ? 'error' : '';
    const statusMarkup = item.status === '处理中' ? '<div class="progress-track"><div class="progress-bar" style="width:58%"></div></div>' : `<span class="file-status ${statusClass}">${item.status}</span>`;
    return `<div class="file-item" data-id="${item.id}"><div class="file-badge ${isPdf ? 'pdf' : ''}">${isPdf ? 'PDF' : 'IMG'}</div><div class="file-info"><div class="file-name" title="${item.file.name}">${item.file.name}</div><div class="file-meta">${fileType(item.file)} · ${formatBytes(item.file.size)}</div></div>${statusMarkup}<button class="remove-file" type="button" aria-label="移除 ${item.file.name}">×</button></div>`;
  }).join('');
  fileList.querySelectorAll('.remove-file').forEach((button) => button.addEventListener('click', () => removeFile(button.closest('.file-item').dataset.id)));
}

function setTargetSize(value) {
  const number = Math.min(50000, Math.max(20, Number(value) || 200));
  targetInput.value = number;
  document.querySelectorAll('.quick-sizes button').forEach((button) => button.classList.toggle('active', Number(button.dataset.size) === number));
}

function setStatus(id, status) {
  const item = state.files.find((entry) => entry.id === id);
  if (item) item.status = status;
  renderQueue();
}

async function canvasToBuffer(canvas) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

async function processPdf(item, outputDir, targetKB) {
  const pdfData = new Uint8Array(await item.file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
  const outputs = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 1800 / Math.max(baseViewport.width, baseViewport.height));
    const viewport = page.getViewport({ scale: Math.max(1.2, scale) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport, background: '#ffffff' }).promise;
    const buffer = await canvasToBuffer(canvas);
    const stem = item.file.name.replace(/\.pdf$/i, '');
    const result = await window.zippping.processRendered({ fileName: `${stem}-page-${String(pageNumber).padStart(2, '0')}.jpg`, outputDir, targetKB, buffer });
    outputs.push(result);
  }
  return outputs;
}

async function processAll() {
  if (state.processing || !state.files.length) return;
  state.processing = true;
  $('#resultBanner').hidden = true;
  const targetKB = Math.min(50000, Math.max(20, Number(targetInput.value) || 200));
  const firstPath = state.files[0].path;
  const outputDir = state.outputDir || `${firstPath.substring(0, Math.max(firstPath.lastIndexOf('/'), firstPath.lastIndexOf('\\')))}${navigator.platform.includes('Mac') ? '/' : '\\'}Zippping 输出`;
  let completed = 0;
  let lastOutput = null;
  for (const item of state.files) {
    setStatus(item.id, '处理中');
    try {
      const outputs = item.type === 'pdf' ? await processPdf(item, outputDir, targetKB) : [await window.zippping.processImage({ filePath: item.path, outputDir, targetKB })];
      lastOutput = outputs.at(-1)?.outputPath || lastOutput;
      setStatus(item.id, `完成 · ${outputs.length > 1 ? `${outputs.length} 页` : formatBytes(outputs[0].bytes)}`);
      completed += 1;
    } catch (error) {
      console.error(error);
      setStatus(item.id, '失败');
    }
  }
  state.processing = false;
  state.lastOutput = lastOutput;
  renderQueue();
  if (completed) {
    $('#resultTitle').textContent = completed === state.files.length ? '全部处理完成' : '部分处理完成';
    $('#resultDetail').textContent = `${completed} 个源文件已输出到「${outputDir}」`;
    $('#resultBanner').hidden = false;
  }
}

dropzone.addEventListener('click', (event) => { if (event.target !== $('#browseButton')) fileInput.click(); });
$('#browseButton').addEventListener('click', (event) => { event.stopPropagation(); fileInput.click(); });
dropzone.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') fileInput.click(); });
fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });
['dragenter', 'dragover'].forEach((eventName) => dropzone.addEventListener(eventName, (event) => { event.preventDefault(); dropzone.classList.add('dragging'); }));
['dragleave', 'drop'].forEach((eventName) => dropzone.addEventListener(eventName, (event) => { event.preventDefault(); dropzone.classList.remove('dragging'); }));
dropzone.addEventListener('drop', (event) => addFiles(event.dataTransfer.files));
document.querySelectorAll('.quick-sizes button').forEach((button) => button.addEventListener('click', () => setTargetSize(button.dataset.size)));
targetInput.addEventListener('change', () => setTargetSize(targetInput.value));
$('#clearButton').addEventListener('click', () => { if (!state.processing) { state.files = []; renderQueue(); } });
$('#startButton').addEventListener('click', processAll);
$('#chooseOutputButton').addEventListener('click', async () => { const selected = await window.zippping.chooseOutputDir(); if (selected) { state.outputDir = selected; $('#outputPathLabel').textContent = selected; } });
$('#openResultButton').addEventListener('click', () => { if (state.lastOutput) window.zippping.revealOutput(state.lastOutput); });
window.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'o') { event.preventDefault(); fileInput.click(); } });
