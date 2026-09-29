const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const sharp = require('sharp');
const bmp = require('bmp-js');
const heicConvert = require('heic-convert');

const isMac = process.platform === 'darwin';

function createWindow() {
  const window = new BrowserWindow({
    width: 1120,
    height: 800,
    minWidth: 860,
    minHeight: 680,
    backgroundColor: '#f5f7fa',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false
    }
  });

  window.loadFile(path.join(__dirname, 'src', 'index.html'));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

async function encodeToLimit(input, targetBytes) {
  const source = sharp(input, { animated: false }).rotate();
  const metadata = await source.metadata();
  const originalWidth = metadata.width || 1;
  const originalHeight = metadata.height || 1;
  let width = originalWidth;
  let height = originalHeight;

  async function encode(quality, currentWidth, currentHeight) {
    return source
      .clone()
      .resize({ width: currentWidth, height: currentHeight, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:4:4' })
      .toBuffer();
  }

  // Search quality first so the original dimensions are kept whenever possible.
  let best = null;
  let low = 18;
  let high = 100;
  for (let i = 0; i < 9; i += 1) {
    if (low > high) break;
    const quality = Math.round((low + high) / 2);
    const candidate = await encode(quality, width, height);
    if (candidate.length <= targetBytes) {
      best = candidate;
      low = quality + 1;
    } else {
      high = quality - 1;
    }
  }

  if (!best) {
    // Very small limits need a dimension reduction after quality is exhausted.
    let scale = 0.9;
    for (let i = 0; i < 14; i += 1) {
      const candidateWidth = Math.max(320, Math.round(originalWidth * scale));
      const candidateHeight = Math.max(320, Math.round(originalHeight * scale));
      const candidate = await encode(18, candidateWidth, candidateHeight);
      if (candidate.length <= targetBytes) {
        best = candidate;
        width = candidateWidth;
        height = candidateHeight;
        break;
      }
      scale *= 0.82;
    }
  }

  if (!best) {
    // Return the smallest practical JPEG; the renderer marks it as over-limit if needed.
    best = await encode(12, Math.max(160, Math.round(originalWidth * 0.35)), Math.max(160, Math.round(originalHeight * 0.35)));
    width = Math.max(160, Math.round(originalWidth * 0.35));
    height = Math.max(160, Math.round(originalHeight * 0.35));
  }

  return {
    buffer: best,
    bytes: best.length,
    width,
    height,
    originalWidth,
    originalHeight,
    withinLimit: best.length <= targetBytes
  };
}

async function normalizeImageInput(filePath, sourceBuffer) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.heic' || extension === '.heif') {
    return heicConvert({ buffer: sourceBuffer, format: 'JPEG', quality: 1 });
  }
  if (extension === '.bmp') {
    const decoded = bmp.decode(sourceBuffer);
    return { data: decoded.data, raw: { width: decoded.width, height: decoded.height, channels: 4 } };
  }
  return sourceBuffer;
}

function safeOutputName(filePath, suffix = '') {
  const base = path.basename(filePath, path.extname(filePath));
  const normalized = base.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'image';
  return `${normalized}${suffix}.jpg`;
}

async function writeUnique(outputDir, fileName, buffer) {
  await fs.mkdir(outputDir, { recursive: true });
  const parsed = path.parse(fileName);
  let candidate = path.join(outputDir, fileName);
  let index = 2;
  while (true) {
    try {
      await fs.access(candidate);
      candidate = path.join(outputDir, `${parsed.name}-${index}${parsed.ext}`);
      index += 1;
    } catch {
      await fs.writeFile(candidate, buffer);
      return candidate;
    }
  }
}

ipcMain.handle('choose-output-dir', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('process-image', async (_event, { filePath, outputDir, targetKB }) => {
  const targetBytes = clamp(Number(targetKB) || 200, 20, 50000) * 1024;
  const sourceBuffer = await normalizeImageInput(filePath, await fs.readFile(filePath));
  const result = await encodeToLimit(sourceBuffer, targetBytes);
  const outputPath = await writeUnique(outputDir, safeOutputName(filePath), result.buffer);
  return { ...result, outputPath, name: path.basename(filePath), outputName: path.basename(outputPath) };
});

ipcMain.handle('process-rendered', async (_event, { fileName, outputDir, targetKB, buffer }) => {
  const targetBytes = clamp(Number(targetKB) || 200, 20, 50000) * 1024;
  const result = await encodeToLimit(Buffer.from(buffer), targetBytes);
  const outputPath = await writeUnique(outputDir, safeOutputName(fileName), result.buffer);
  return { ...result, outputPath, name: fileName, outputName: path.basename(outputPath) };
});

ipcMain.handle('reveal-output', async (_event, outputPath) => {
  const { shell } = require('electron');
  shell.showItemInFolder(outputPath);
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});
