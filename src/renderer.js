// ===== PDFy Renderer - PDF Editor Engine =====

const pdfjsLib = require('pdfjs-dist');
const fabric = require('fabric').fabric;
const { PDFDocument, rgb, StandardFonts, degrees } = require('pdf-lib');

// PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = '../bundle/pdf.worker.mjs';

// ===== State =====
const state = {
  pdfDoc: null,
  pdfBytes: null,
  filePath: null,
  fileName: null,
  currentPage: 1,
  totalPages: 0,
  scale: 1.5,
  currentTool: 'select',
  pages: [], // { pdfCanvas, fabricCanvas, objects }
  history: [],
  historyIndex: -1,
  noFill: false,
  isDrawing: false,
  drawStart: null,
};

// ===== DOM Elements =====
const $ = (id) => document.getElementById(id);
const welcomeScreen = $('welcome-screen');
const editorContainer = $('editor-container');
const pageContainer = $('page-container');
const thumbnailList = $('thumbnail-list');
const fileNameEl = $('file-name');
const statusPage = $('status-page');
const statusTotal = $('status-total');
const statusZoom = $('status-zoom');
const pageInput = $('page-input');
const toast = $('toast');
const toastMsg = $('toast-msg');

// ===== Init =====
function init() {
  setupToolbar();
  setupProperties();
  setupNavigation();
  setupKeyboard();
  setupDragDrop();
  setupElectronListeners();
  setupFontPreview();
}

function setupFontPreview() {
  const select = $('prop-font-family');
  // Apply font-family to each option so user sees a preview
  Array.from(select.options).forEach(opt => {
    opt.style.fontFamily = opt.value;
  });
  // Update the select element itself when font changes
  select.addEventListener('change', () => {
    select.style.fontFamily = select.value;
  });
  select.style.fontFamily = select.value;
}

// ===== Show Toast =====
function showToast(msg, duration = 2500) {
  toastMsg.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.add('hidden'), duration);
}

// ===== Toolbar Setup =====
function setupToolbar() {
  const toolBtns = document.querySelectorAll('[data-tool]');
  toolBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      setTool(btn.dataset.tool);
    });
  });

  $('btn-open-welcome').addEventListener('click', () => window.electronAPI.openFile());
  $('btn-open-file').addEventListener('click', () => window.electronAPI.openFile());
  $('btn-save').addEventListener('click', () => savePDF());
  $('btn-undo').addEventListener('click', () => undo());
  $('btn-redo').addEventListener('click', () => redo());
}

function setTool(tool) {
  // Remove edit-text overlays when switching away
  if (state.currentTool === 'editText' && tool !== 'editText') {
    removeTextOverlays();
    pageContainer.classList.remove('edit-text-active');
  }
  if (tool === 'editText') {
    pageContainer.classList.add('edit-text-active');
  }
  state.currentTool = tool;
  document.querySelectorAll('[data-tool]').forEach(b => b.classList.remove('active'));
  const active = document.querySelector(`[data-tool="${tool}"]`);
  if (active) active.classList.add('active');

  // Update properties bar visibility
  updatePropertiesVisibility(tool);

  // Configure all fabric canvases
  state.pages.forEach((page, pageIdx) => {
    if (!page.fabricCanvas) return;
    const fc = page.fabricCanvas;

    if (tool === 'select') {
      fc.isDrawingMode = false;
      fc.selection = true;
      fc.forEachObject(o => { o.selectable = true; o.evented = true; });
      fc.defaultCursor = 'default';
    } else if (tool === 'hand') {
      fc.isDrawingMode = false;
      fc.selection = false;
      fc.forEachObject(o => { o.selectable = false; o.evented = false; });
      fc.defaultCursor = 'grab';
    } else if (tool === 'draw') {
      fc.isDrawingMode = true;
      fc.freeDrawingBrush.color = $('prop-color').value;
      fc.freeDrawingBrush.width = parseInt($('prop-stroke-width').value);
      fc.selection = false;
    } else if (tool === 'highlight') {
      fc.isDrawingMode = true;
      fc.freeDrawingBrush.color = 'rgba(255, 255, 0, 0.35)';
      fc.freeDrawingBrush.width = 20;
      fc.selection = false;
    } else if (tool === 'editText') {
      fc.isDrawingMode = false;
      fc.selection = false;
      fc.forEachObject(o => { o.selectable = false; o.evented = false; });
      fc.defaultCursor = 'text';
      showTextOverlays(pageIdx);
    } else if (tool === 'eraser') {
      fc.isDrawingMode = false;
      fc.selection = false;
      fc.defaultCursor = 'not-allowed';
      fc.forEachObject(o => {
        o.selectable = false;
        o.evented = true;
        o.hoverCursor = 'not-allowed';
      });
    } else {
      fc.isDrawingMode = false;
      fc.selection = false;
      fc.forEachObject(o => { o.selectable = false; o.evented = false; });
      fc.defaultCursor = 'crosshair';
    }
  });
}

function updatePropertiesVisibility(tool) {
  const textTools = ['text', 'editText'];
  const shapeTools = ['rect', 'circle', 'line', 'arrow'];
  const drawTools = ['draw', 'highlight'];
  const colorTools = ['text', 'editText', 'draw', 'rect', 'circle', 'line', 'arrow'];
  const strokeTools = ['draw', 'rect', 'circle', 'line', 'arrow'];
  const fillTools = ['rect', 'circle'];

  $('props-text').style.display = textTools.includes(tool) || tool === 'select' ? 'flex' : 'none';
  $('props-color').style.display = colorTools.includes(tool) || tool === 'select' ? 'flex' : 'none';
  $('props-stroke').style.display = strokeTools.includes(tool) || tool === 'select' ? 'flex' : 'none';
  $('props-fill').style.display = fillTools.includes(tool) || tool === 'select' ? 'flex' : 'none';
  $('props-opacity').style.display = tool !== 'hand' ? 'flex' : 'none';
  $('props-delete').style.display = tool === 'select' || tool === 'eraser' ? 'flex' : 'none';
}

// ===== Properties Setup =====
function setupProperties() {
  // Color change
  $('prop-color').addEventListener('input', (e) => {
    const fc = getCurrentFabricCanvas();
    if (!fc) return;
    const obj = fc.getActiveObject();
    if (obj) {
      if (obj.type === 'i-text' || obj.type === 'textbox') {
        obj.set('fill', e.target.value);
      }
      fc.renderAll();
      saveState();
    }
    if (state.currentTool === 'draw') {
      fc.freeDrawingBrush.color = e.target.value;
    }
  });

  // Stroke color
  $('prop-stroke-color').addEventListener('input', (e) => {
    const fc = getCurrentFabricCanvas();
    if (!fc) return;
    const obj = fc.getActiveObject();
    if (obj) {
      obj.set('stroke', e.target.value);
      fc.renderAll();
      saveState();
    }
  });

  // Stroke width
  $('prop-stroke-width').addEventListener('change', (e) => {
    const fc = getCurrentFabricCanvas();
    if (!fc) return;
    const val = parseInt(e.target.value);
    const obj = fc.getActiveObject();
    if (obj) {
      obj.set('strokeWidth', val);
      fc.renderAll();
      saveState();
    }
    if (state.currentTool === 'draw') {
      fc.freeDrawingBrush.width = val;
    }
  });

  // Fill color
  $('prop-fill-color').addEventListener('input', (e) => {
    const fc = getCurrentFabricCanvas();
    if (!fc) return;
    const obj = fc.getActiveObject();
    if (obj && !state.noFill) {
      obj.set('fill', e.target.value);
      fc.renderAll();
      saveState();
    }
  });

  // No fill toggle
  $('prop-no-fill').addEventListener('click', () => {
    state.noFill = !state.noFill;
    $('prop-no-fill').classList.toggle('active', state.noFill);
    const fc = getCurrentFabricCanvas();
    if (!fc) return;
    const obj = fc.getActiveObject();
    if (obj) {
      obj.set('fill', state.noFill ? 'transparent' : $('prop-fill-color').value);
      fc.renderAll();
      saveState();
    }
  });

  // Opacity
  $('prop-opacity').addEventListener('input', (e) => {
    $('prop-opacity-val').textContent = e.target.value + '%';
    const fc = getCurrentFabricCanvas();
    if (!fc) return;
    const obj = fc.getActiveObject();
    if (obj) {
      obj.set('opacity', parseInt(e.target.value) / 100);
      fc.renderAll();
      saveState();
    }
  });

  // Font family
  $('prop-font-family').addEventListener('change', (e) => {
    const fc = getCurrentFabricCanvas();
    if (!fc) return;
    const obj = fc.getActiveObject();
    if (obj && (obj.type === 'i-text' || obj.type === 'textbox')) {
      obj.set('fontFamily', e.target.value);
      fc.renderAll();
      saveState();
    }
  });

  // Font size
  $('prop-font-size').addEventListener('change', (e) => {
    const fc = getCurrentFabricCanvas();
    if (!fc) return;
    const obj = fc.getActiveObject();
    if (obj && (obj.type === 'i-text' || obj.type === 'textbox')) {
      obj.set('fontSize', parseInt(e.target.value));
      fc.renderAll();
      saveState();
    }
  });

  // Bold
  $('prop-bold').addEventListener('click', () => {
    const fc = getCurrentFabricCanvas();
    if (!fc) return;
    const obj = fc.getActiveObject();
    if (obj && (obj.type === 'i-text' || obj.type === 'textbox')) {
      obj.set('fontWeight', obj.fontWeight === 'bold' ? 'normal' : 'bold');
      $('prop-bold').classList.toggle('active', obj.fontWeight === 'bold');
      fc.renderAll();
      saveState();
    }
  });

  // Italic
  $('prop-italic').addEventListener('click', () => {
    const fc = getCurrentFabricCanvas();
    if (!fc) return;
    const obj = fc.getActiveObject();
    if (obj && (obj.type === 'i-text' || obj.type === 'textbox')) {
      obj.set('fontStyle', obj.fontStyle === 'italic' ? 'normal' : 'italic');
      $('prop-italic').classList.toggle('active', obj.fontStyle === 'italic');
      fc.renderAll();
      saveState();
    }
  });

  // Underline
  $('prop-underline').addEventListener('click', () => {
    const fc = getCurrentFabricCanvas();
    if (!fc) return;
    const obj = fc.getActiveObject();
    if (obj && (obj.type === 'i-text' || obj.type === 'textbox')) {
      obj.set('underline', !obj.underline);
      $('prop-underline').classList.toggle('active', obj.underline);
      fc.renderAll();
      saveState();
    }
  });

  // Delete
  $('prop-delete').addEventListener('click', () => {
    const fc = getCurrentFabricCanvas();
    if (!fc) return;
    const obj = fc.getActiveObject();
    if (obj) {
      fc.remove(obj);
      fc.renderAll();
      saveState();
    }
  });
}

// ===== Navigation =====
function setupNavigation() {
  $('btn-prev-page').addEventListener('click', () => goToPage(state.currentPage - 1));
  $('btn-next-page').addEventListener('click', () => goToPage(state.currentPage + 1));
  pageInput.addEventListener('change', () => goToPage(parseInt(pageInput.value)));
  $('btn-zoom-in').addEventListener('click', () => setZoom(state.scale + 0.25));
  $('btn-zoom-out').addEventListener('click', () => setZoom(state.scale - 0.25));
}

function goToPage(num) {
  if (num < 1 || num > state.totalPages) return;
  state.currentPage = num;
  updatePageUI();
  // Scroll to page within the scroll container
  const wrapper = pageContainer.children[num - 1];
  if (wrapper) {
    const scrollContainer = $('canvas-scroll');
    const wrapperTop = wrapper.offsetTop - pageContainer.offsetTop;
    scrollContainer.scrollTo({ top: wrapperTop, behavior: 'smooth' });
  }
}

function updatePageUI() {
  statusPage.textContent = `Pagina: ${state.currentPage}`;
  statusTotal.textContent = ` / ${state.totalPages}`;
  pageInput.value = state.currentPage;
  pageInput.max = state.totalPages;

  // Update thumbnails
  document.querySelectorAll('.thumbnail-item').forEach((t, i) => {
    t.classList.toggle('active', i === state.currentPage - 1);
  });
}

function setZoom(newScale) {
  newScale = Math.max(0.5, Math.min(4, newScale));
  state.scale = newScale;
  statusZoom.textContent = Math.round(newScale * 100 / 1.5) + '%';
  rerenderAllPages();
}

// ===== Keyboard =====
function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    // Don't intercept when typing in inputs, selects, or Fabric text editing
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
      return;
    }

    // Also check if any Fabric IText is in editing mode
    const fc = getCurrentFabricCanvas();
    if (fc) {
      const activeObj = fc.getActiveObject();
      if (activeObj && activeObj.isEditing) return;
    }

    const key = e.key.toLowerCase();

    // Tool shortcuts
    if (!e.ctrlKey && !e.metaKey) {
      switch (key) {
        case 'v': setTool('select'); break;
        case 'h': setTool('hand'); break;
        case 't': setTool('text'); break;
        case 'd': setTool('draw'); break;
        case 'g': setTool('highlight'); break;
        case 'f': setTool('editText'); break;
        case 'e': setTool('eraser'); break;
        case 'r': setTool('rect'); break;
        case 'c': setTool('circle'); break;
        case 'l': setTool('line'); break;
        case 'a': setTool('arrow'); break;
        case 'w': setTool('whiteout'); break;
        case 'delete':
        case 'backspace':
          if (state.currentTool === 'select') {
            const fc = getCurrentFabricCanvas();
            if (fc) {
              const obj = fc.getActiveObject();
              if (obj && !obj.isEditing) {
                fc.remove(obj);
                fc.renderAll();
                saveState();
              }
            }
          }
          break;
      }
    }
  });
}

// ===== Drag & Drop =====
function setupDragDrop() {
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  });

  document.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].name.toLowerCase().endsWith('.pdf')) {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = btoa(
          new Uint8Array(reader.result).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        loadPDF(base64, files[0].name, null);
      };
      reader.readAsArrayBuffer(files[0]);
    }
  });
}

// ===== Electron Listeners =====
function setupElectronListeners() {
  window.electronAPI.onFileOpened((data) => {
    loadPDF(data.data, data.name, data.path);
  });

  window.electronAPI.onSaveFile(() => savePDF());
  window.electronAPI.onSaveFileAs(async (data) => {
    // If we have pending save data (from no-path save), use it
    if (state._pendingSaveData) {
      await window.electronAPI.writeFile(data.path, state._pendingSaveData);
      state.filePath = data.path;
      state._pendingSaveData = null;
      showToast('PDF guardado correctamente');
    } else {
      savePDF(data.path);
    }
  });
  window.electronAPI.onUndo(() => undo());
  window.electronAPI.onRedo(() => redo());
  window.electronAPI.onZoomIn(() => setZoom(state.scale + 0.25));
  window.electronAPI.onZoomOut(() => setZoom(state.scale - 0.25));
  window.electronAPI.onZoomFit(() => setZoom(1.5));
}

// ===== Load PDF =====
async function loadPDF(base64Data, fileName, filePath) {
  try {
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    state.pdfBytes = bytes;
    state.filePath = filePath;
    state.fileName = fileName;
    state.pdfDoc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
    state.totalPages = state.pdfDoc.numPages;
    state.currentPage = 1;
    state.pages = [];
    state.history = [];
    state.historyIndex = -1;

    welcomeScreen.classList.add('hidden');
    editorContainer.classList.remove('hidden');
    fileNameEl.textContent = fileName;

    pageContainer.innerHTML = '';
    thumbnailList.innerHTML = '';

    await renderAllPages();
    updatePageUI();
    showToast(`${fileName} cargado - ${state.totalPages} paginas`);
  } catch (err) {
    showToast('Error al cargar el PDF: ' + err.message, 4000);
    console.error(err);
  }
}

// ===== Render All Pages =====
async function renderAllPages() {
  for (let i = 1; i <= state.totalPages; i++) {
    await renderPage(i);
  }
  // Set tool after all pages rendered
  setTool(state.currentTool);
}

async function rerenderAllPages() {
  // Re-render PDF canvases at new scale, keep fabric objects
  for (let i = 0; i < state.pages.length; i++) {
    const page = state.pages[i];
    const pdfPage = await state.pdfDoc.getPage(i + 1);
    const viewport = pdfPage.getViewport({ scale: state.scale });

    page.pdfCanvas.width = viewport.width;
    page.pdfCanvas.height = viewport.height;

    const ctx = page.pdfCanvas.getContext('2d');
    await pdfPage.render({ canvasContext: ctx, viewport }).promise;

    // Resize fabric canvas
    page.fabricCanvas.setWidth(viewport.width);
    page.fabricCanvas.setHeight(viewport.height);
    page.fabricCanvas.renderAll();

    // Update wrapper size
    const wrapper = page.pdfCanvas.parentElement;
    wrapper.style.width = viewport.width + 'px';
    wrapper.style.height = viewport.height + 'px';
  }
}

async function renderPage(pageNum) {
  const pdfPage = await state.pdfDoc.getPage(pageNum);
  const viewport = pdfPage.getViewport({ scale: state.scale });

  // Create wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'page-wrapper';
  wrapper.style.width = viewport.width + 'px';
  wrapper.style.height = viewport.height + 'px';
  wrapper.dataset.page = pageNum;

  // PDF render canvas
  const pdfCanvas = document.createElement('canvas');
  pdfCanvas.className = 'pdf-render';
  pdfCanvas.width = viewport.width;
  pdfCanvas.height = viewport.height;
  wrapper.appendChild(pdfCanvas);

  const ctx = pdfCanvas.getContext('2d');
  await pdfPage.render({ canvasContext: ctx, viewport }).promise;

  // Fabric canvas for annotations
  const fabricEl = document.createElement('canvas');
  fabricEl.className = 'fabric-layer';
  fabricEl.width = viewport.width;
  fabricEl.height = viewport.height;
  wrapper.appendChild(fabricEl);

  pageContainer.appendChild(wrapper);

  const fabricCanvas = new fabric.Canvas(fabricEl, {
    width: viewport.width,
    height: viewport.height,
    selection: true,
    preserveObjectStacking: true,
  });

  // Setup fabric canvas events
  setupFabricEvents(fabricCanvas, pageNum);

  // Extract text items for edit-text tool
  const textContent = await pdfPage.getTextContent();

  const textItems = textContent.items
    .filter(item => item.str && item.str.trim())
    .map(item => {
      const tx = item.transform;
      // transform: [scaleX, skewY, skewX, scaleY, translateX, translateY]
      const fontSize = Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1]);
      const x = tx[4] * state.scale;
      const y = viewport.height - (tx[5] * state.scale) - (fontSize * state.scale);
      const w = (item.width || 0) * state.scale;
      const h = fontSize * state.scale * 1.2;

      return {
        str: item.str,
        x,
        y,
        width: w || fontSize * state.scale * item.str.length * 0.6,
        height: h,
        fontSize: fontSize * state.scale,
        fontFamily: item.fontName || 'Helvetica',
      };
    });

  const pageData = { pdfCanvas, fabricCanvas, objects: [], textItems };
  state.pages.push(pageData);

  // Create thumbnail
  createThumbnail(pdfCanvas, pageNum);
}

function createThumbnail(pdfCanvas, pageNum) {
  const item = document.createElement('div');
  item.className = 'thumbnail-item' + (pageNum === 1 ? ' active' : '');
  item.addEventListener('click', () => goToPage(pageNum));

  const thumbCanvas = document.createElement('canvas');
  const scale = 140 / pdfCanvas.width;
  thumbCanvas.width = 140;
  thumbCanvas.height = pdfCanvas.height * scale;
  const tCtx = thumbCanvas.getContext('2d');
  tCtx.drawImage(pdfCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
  item.appendChild(thumbCanvas);

  const label = document.createElement('span');
  label.className = 'thumbnail-label';
  label.textContent = pageNum;
  item.appendChild(label);

  thumbnailList.appendChild(item);
}

// ===== Fabric Canvas Events =====
function setupFabricEvents(fc, pageNum) {
  // Track current page on interaction
  fc.on('mouse:down', (opt) => {
    state.currentPage = pageNum;
    updatePageUI();
    handleMouseDown(fc, opt);
  });

  fc.on('mouse:move', (opt) => {
    handleMouseMove(fc, opt);
  });

  fc.on('mouse:up', (opt) => {
    handleMouseUp(fc, opt);
  });

  // On object selected, update property controls
  fc.on('selection:created', (opt) => updatePropsFromObject(opt.selected[0]));
  fc.on('selection:updated', (opt) => updatePropsFromObject(opt.selected[0]));

  // Eraser hover effect
  fc.on('mouse:over', (opt) => {
    if (state.currentTool === 'eraser' && opt.target) {
      opt.target._origStroke = opt.target.stroke;
      opt.target._origStrokeWidth = opt.target.strokeWidth;
      opt.target.set({
        stroke: '#ff4444',
        strokeWidth: 2,
      });
      fc.renderAll();
    }
  });

  fc.on('mouse:out', (opt) => {
    if (state.currentTool === 'eraser' && opt.target) {
      opt.target.set({
        stroke: opt.target._origStroke || 'transparent',
        strokeWidth: opt.target._origStrokeWidth || 0,
      });
      fc.renderAll();
    }
  });

  // Save state on modifications
  fc.on('object:modified', () => saveState());
  fc.on('path:created', () => saveState());
}

function updatePropsFromObject(obj) {
  if (!obj) return;
  if (obj.type === 'i-text' || obj.type === 'textbox') {
    $('prop-font-family').value = obj.fontFamily || 'Helvetica';
    $('prop-font-size').value = obj.fontSize || 14;
    $('prop-bold').classList.toggle('active', obj.fontWeight === 'bold');
    $('prop-italic').classList.toggle('active', obj.fontStyle === 'italic');
    $('prop-underline').classList.toggle('active', !!obj.underline);
    $('prop-color').value = obj.fill || '#000000';
  }
  if (obj.stroke) {
    $('prop-stroke-color').value = obj.stroke;
  }
  if (obj.strokeWidth) {
    $('prop-stroke-width').value = obj.strokeWidth;
  }
  const opacity = Math.round((obj.opacity || 1) * 100);
  $('prop-opacity').value = opacity;
  $('prop-opacity-val').textContent = opacity + '%';
}

// ===== Mouse Handlers for Shape Drawing =====
function handleMouseDown(fc, opt) {
  const tool = state.currentTool;
  const pointer = fc.getPointer(opt.e);

  if (tool === 'eraser') {
    const target = fc.findTarget(opt.e);
    if (target) {
      // If this text was created by editText, also remove its whiteout
      if (target._isEditedText && target._whiteoutId) {
        fc.remove(target._whiteoutId);
      }
      // If this is a whiteout from editText, also find and remove its text
      if (target._isEditWhiteout) {
        fc.getObjects().forEach(o => {
          if (o._whiteoutId === target) fc.remove(o);
        });
      }
      fc.remove(target);
      fc.discardActiveObject();
      fc.renderAll();
      saveState();
    }
    return;
  }

  if (tool === 'text') {
    const text = new fabric.IText('Texto', {
      left: pointer.x,
      top: pointer.y,
      fontFamily: $('prop-font-family').value,
      fontSize: parseInt($('prop-font-size').value),
      fill: $('prop-color').value,
      fontWeight: $('prop-bold').classList.contains('active') ? 'bold' : 'normal',
      fontStyle: $('prop-italic').classList.contains('active') ? 'italic' : 'normal',
      underline: $('prop-underline').classList.contains('active'),
      editable: true,
    });
    fc.add(text);
    fc.setActiveObject(text);
    text.enterEditing();
    text.selectAll();
    fc.renderAll();
    saveState();
    return;
  }

  if (tool === 'image') {
    window.electronAPI.openImage().then(result => {
      if (!result) return;
      fabric.Image.fromURL(result.data, (img) => {
        const maxW = fc.width * 0.5;
        const maxH = fc.height * 0.5;
        const scale = Math.min(maxW / img.width, maxH / img.height, 1);
        img.set({
          left: pointer.x,
          top: pointer.y,
          scaleX: scale,
          scaleY: scale,
        });
        fc.add(img);
        fc.setActiveObject(img);
        fc.renderAll();
        saveState();
      });
    });
    return;
  }

  if (['rect', 'circle', 'line', 'arrow', 'whiteout'].includes(tool)) {
    state.isDrawing = true;
    state.drawStart = pointer;

    let obj;
    const strokeColor = $('prop-stroke-color').value;
    const strokeWidth = parseInt($('prop-stroke-width').value);
    const fillColor = state.noFill ? 'transparent' : $('prop-fill-color').value;

    if (tool === 'rect') {
      obj = new fabric.Rect({
        left: pointer.x, top: pointer.y,
        width: 0, height: 0,
        fill: fillColor, stroke: strokeColor, strokeWidth,
        rx: 0, ry: 0,
      });
    } else if (tool === 'circle') {
      obj = new fabric.Ellipse({
        left: pointer.x, top: pointer.y,
        rx: 0, ry: 0,
        fill: fillColor, stroke: strokeColor, strokeWidth,
      });
    } else if (tool === 'line') {
      obj = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
        stroke: strokeColor, strokeWidth,
        selectable: true,
      });
    } else if (tool === 'arrow') {
      obj = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
        stroke: strokeColor, strokeWidth,
        selectable: true,
      });
      obj._isArrow = true;
    } else if (tool === 'whiteout') {
      obj = new fabric.Rect({
        left: pointer.x, top: pointer.y,
        width: 0, height: 0,
        fill: '#ffffff', stroke: 'transparent', strokeWidth: 0,
      });
      obj._isWhiteout = true;
    }

    if (obj) {
      state._tempObj = obj;
      fc.add(obj);
      fc.renderAll();
    }
  }
}

function handleMouseMove(fc, opt) {
  if (!state.isDrawing || !state._tempObj) return;

  const pointer = fc.getPointer(opt.e);
  const tool = state.currentTool;
  const obj = state._tempObj;
  const sx = state.drawStart.x;
  const sy = state.drawStart.y;

  if (tool === 'rect' || tool === 'whiteout') {
    const left = Math.min(sx, pointer.x);
    const top = Math.min(sy, pointer.y);
    obj.set({
      left, top,
      width: Math.abs(pointer.x - sx),
      height: Math.abs(pointer.y - sy),
    });
  } else if (tool === 'circle') {
    const left = Math.min(sx, pointer.x);
    const top = Math.min(sy, pointer.y);
    obj.set({
      left, top,
      rx: Math.abs(pointer.x - sx) / 2,
      ry: Math.abs(pointer.y - sy) / 2,
    });
  } else if (tool === 'line' || tool === 'arrow') {
    obj.set({ x2: pointer.x, y2: pointer.y });
  }

  fc.renderAll();
}

function handleMouseUp(fc, opt) {
  if (!state.isDrawing) return;
  state.isDrawing = false;

  if (state._tempObj) {
    // If arrow, add arrowhead
    if (state._tempObj._isArrow) {
      addArrowHead(fc, state._tempObj);
    }

    fc.setActiveObject(state._tempObj);
    state._tempObj = null;
    fc.renderAll();
    saveState();
    setTool('select');
  }
}

function addArrowHead(fc, line) {
  const x1 = line.x1, y1 = line.y1, x2 = line.x2, y2 = line.y2;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLen = 15;

  const points = [
    { x: x2, y: y2 },
    { x: x2 - headLen * Math.cos(angle - Math.PI / 6), y: y2 - headLen * Math.sin(angle - Math.PI / 6) },
    { x: x2 - headLen * Math.cos(angle + Math.PI / 6), y: y2 - headLen * Math.sin(angle + Math.PI / 6) },
  ];

  const head = new fabric.Polygon(points, {
    fill: line.stroke,
    stroke: line.stroke,
    strokeWidth: 1,
    selectable: false,
    evented: false,
  });

  const group = new fabric.Group([line, head], {
    selectable: true,
    evented: true,
  });

  fc.remove(line);
  fc.add(group);
}

// ===== Edit Existing Text =====

// Group nearby text items into logical lines/blocks
function groupTextItems(textItems) {
  if (!textItems || textItems.length === 0) return [];

  // Sort by y position (top to bottom), then x (left to right)
  const sorted = [...textItems].sort((a, b) => {
    const yDiff = a.y - b.y;
    if (Math.abs(yDiff) < 5) return a.x - b.x;
    return yDiff;
  });

  const groups = [];
  let currentGroup = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = currentGroup[currentGroup.length - 1];
    const curr = sorted[i];

    // Same line: similar y position and close horizontally
    const sameLine = Math.abs(curr.y - prev.y) < prev.fontSize * 0.5;
    const closeX = curr.x - (prev.x + prev.width) < prev.fontSize * 2;

    if (sameLine && closeX) {
      currentGroup.push(curr);
    } else {
      groups.push(currentGroup);
      currentGroup = [curr];
    }
  }
  groups.push(currentGroup);

  return groups.map(group => {
    const minX = Math.min(...group.map(t => t.x));
    const minY = Math.min(...group.map(t => t.y));
    const maxX = Math.max(...group.map(t => t.x + t.width));
    const maxY = Math.max(...group.map(t => t.y + t.height));
    const fontSize = group[0].fontSize;
    const fontFamily = group[0].fontFamily;
    const text = group.map(t => t.str).join(' ');

    return {
      str: text,
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      fontSize,
      fontFamily,
      items: group,
    };
  });
}

function showTextOverlays(pageIndex) {
  // Only remove overlays for this specific page wrapper
  const wrapper = pageContainer.children[pageIndex];
  if (!wrapper) return;
  wrapper.querySelectorAll('.text-overlay').forEach(el => el.remove());

  if (pageIndex < 0 || !state.pages[pageIndex]) return;
  const pageData = state.pages[pageIndex];



  const groups = groupTextItems(pageData.textItems);


  groups.forEach((group, idx) => {
    // Skip groups with no meaningful dimensions
    const w = Math.max(group.width, 20);
    const h = Math.max(group.height, group.fontSize * 1.3);

    const overlay = document.createElement('div');
    overlay.className = 'text-overlay';
    overlay.style.left = group.x + 'px';
    overlay.style.top = group.y + 'px';
    overlay.style.width = w + 'px';
    overlay.style.height = h + 'px';
    overlay.dataset.groupIndex = idx;
    overlay.title = group.str;

    overlay.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      convertTextToEditable(pageIndex, group);
      removeTextOverlays();
    });

    wrapper.appendChild(overlay);
  });
}

function removeTextOverlays() {
  document.querySelectorAll('.text-overlay').forEach(el => el.remove());
}

function convertTextToEditable(pageIndex, group) {
  const pageData = state.pages[pageIndex];
  const fc = pageData.fabricCanvas;

  // Determine font properties from the PDF font name
  const fontInfo = parsePdfFontName(group.fontFamily);

  // 1. Create white rectangle to cover original text
  const padding = 2;
  const whiteout = new fabric.Rect({
    left: group.x - padding,
    top: group.y - padding,
    width: group.width + padding * 2,
    height: group.height + padding * 2,
    fill: '#ffffff',
    stroke: 'transparent',
    strokeWidth: 0,
    selectable: false,
    evented: false,
    _isEditWhiteout: true,
  });

  // 2. Create editable text object on top
  const textObj = new fabric.IText(group.str, {
    left: group.x,
    top: group.y,
    fontSize: group.fontSize,
    fontFamily: fontInfo.family,
    fontWeight: fontInfo.bold ? 'bold' : 'normal',
    fontStyle: fontInfo.italic ? 'italic' : 'normal',
    fill: '#000000',
    editable: true,
    _isEditedText: true,
    _whiteoutId: whiteout,
  });

  fc.add(whiteout);
  fc.add(textObj);
  fc.setActiveObject(textObj);
  textObj.enterEditing();
  textObj.selectAll();
  fc.renderAll();

  // Switch to select tool to allow editing
  setTool('select');
  saveState();
  showToast('Texto listo para editar');
}

function parsePdfFontName(fontName) {
  const name = (fontName || '').toLowerCase();
  const bold = name.includes('bold') || name.includes('black') || name.includes('heavy');
  const italic = name.includes('italic') || name.includes('oblique');

  let family = 'Helvetica';
  if (name.includes('times') || name.includes('serif')) family = 'Times New Roman';
  else if (name.includes('courier') || name.includes('mono')) family = 'Courier New';
  else if (name.includes('arial')) family = 'Arial';
  else if (name.includes('georgia')) family = 'Georgia';
  else if (name.includes('verdana')) family = 'Verdana';
  else if (name.includes('helvetica')) family = 'Helvetica';

  return { family, bold, italic };
}

// ===== History (Undo/Redo) =====
function saveState() {
  const stateData = state.pages.map(p => p.fabricCanvas.toJSON());
  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push(stateData);
  state.historyIndex = state.history.length - 1;
  // Limit history
  if (state.history.length > 50) {
    state.history.shift();
    state.historyIndex--;
  }
}

function undo() {
  if (state.historyIndex <= 0) return;
  state.historyIndex--;
  restoreState(state.history[state.historyIndex]);
}

function redo() {
  if (state.historyIndex >= state.history.length - 1) return;
  state.historyIndex++;
  restoreState(state.history[state.historyIndex]);
}

function restoreState(stateData) {
  stateData.forEach((json, i) => {
    if (state.pages[i]) {
      state.pages[i].fabricCanvas.loadFromJSON(json, () => {
        state.pages[i].fabricCanvas.renderAll();
      });
    }
  });
}

// ===== Get Current Fabric Canvas =====
function getCurrentFabricCanvas() {
  const page = state.pages[state.currentPage - 1];
  return page ? page.fabricCanvas : null;
}

// ===== Save PDF =====
async function savePDF(targetPath) {
  try {
    const pdfDoc = await PDFDocument.load(state.pdfBytes);
    const pages = pdfDoc.getPages();

    for (let i = 0; i < state.pages.length; i++) {
      const page = pages[i];
      const fc = state.pages[i].fabricCanvas;
      const objects = fc.getObjects();
      const { width: pageW, height: pageH } = page.getSize();
      const scaleRatio = pageW / fc.width;

      for (const obj of objects) {
        await renderObjectToPDF(pdfDoc, page, obj, scaleRatio, pageH);
      }
    }

    const savedBytes = await pdfDoc.save();
    const base64 = btoa(
      savedBytes.reduce((data, byte) => data + String.fromCharCode(byte), '')
    );

    const savePath = targetPath || state.filePath;
    if (savePath) {
      await window.electronAPI.writeFile(savePath, base64);
      showToast('PDF guardado correctamente');
    } else {
      // No path yet, store the data and ask user for location
      state._pendingSaveData = base64;
      window.electronAPI.saveFile();
    }
  } catch (err) {
    showToast('Error al guardar: ' + err.message, 4000);
    console.error(err);
  }
}

async function renderObjectToPDF(pdfDoc, page, obj, scaleRatio, pageH) {
  const type = obj.type;

  if (type === 'i-text' || type === 'textbox' || type === 'text') {
    // Map font
    let fontKey = StandardFonts.Helvetica;
    const isBold = obj.fontWeight === 'bold';
    const isItalic = obj.fontStyle === 'italic';

    const fontName = (obj.fontFamily || '').toLowerCase();
    if (fontName.includes('times')) {
      fontKey = isBold && isItalic ? StandardFonts.TimesRomanBoldItalic
        : isBold ? StandardFonts.TimesRomanBold
        : isItalic ? StandardFonts.TimesRomanItalic
        : StandardFonts.TimesRoman;
    } else if (fontName.includes('courier')) {
      fontKey = isBold && isItalic ? StandardFonts.CourierBoldOblique
        : isBold ? StandardFonts.CourierBold
        : isItalic ? StandardFonts.CourierOblique
        : StandardFonts.Courier;
    } else {
      fontKey = isBold && isItalic ? StandardFonts.HelveticaBoldOblique
        : isBold ? StandardFonts.HelveticaBold
        : isItalic ? StandardFonts.HelveticaOblique
        : StandardFonts.Helvetica;
    }

    const font = await pdfDoc.embedFont(fontKey);
    const color = hexToRgb(obj.fill || '#000000');
    const fontSize = (obj.fontSize || 14) * scaleRatio * (obj.scaleY || 1);

    page.drawText(obj.text || '', {
      x: obj.left * scaleRatio,
      y: pageH - (obj.top * scaleRatio) - fontSize,
      size: fontSize,
      font,
      color: rgb(color.r / 255, color.g / 255, color.b / 255),
      opacity: obj.opacity || 1,
    });
  } else if (type === 'rect') {
    const color = obj.fill && obj.fill !== 'transparent' ? hexToRgb(obj.fill) : null;
    const strokeColor = obj.stroke && obj.stroke !== 'transparent' ? hexToRgb(obj.stroke) : null;

    const drawOpts = {
      x: obj.left * scaleRatio,
      y: pageH - (obj.top * scaleRatio) - (obj.height * (obj.scaleY || 1) * scaleRatio),
      width: obj.width * (obj.scaleX || 1) * scaleRatio,
      height: obj.height * (obj.scaleY || 1) * scaleRatio,
      opacity: obj.opacity || 1,
    };

    if (color) drawOpts.color = rgb(color.r / 255, color.g / 255, color.b / 255);
    if (strokeColor) {
      drawOpts.borderColor = rgb(strokeColor.r / 255, strokeColor.g / 255, strokeColor.b / 255);
      drawOpts.borderWidth = (obj.strokeWidth || 1) * scaleRatio;
    }

    page.drawRectangle(drawOpts);
  } else if (type === 'ellipse') {
    const color = obj.fill && obj.fill !== 'transparent' ? hexToRgb(obj.fill) : null;
    const strokeColor = obj.stroke && obj.stroke !== 'transparent' ? hexToRgb(obj.stroke) : null;

    const cx = (obj.left + obj.rx * (obj.scaleX || 1)) * scaleRatio;
    const cy = pageH - (obj.top + obj.ry * (obj.scaleY || 1)) * scaleRatio;

    const drawOpts = {
      x: cx,
      y: cy,
      xScale: obj.rx * (obj.scaleX || 1) * scaleRatio,
      yScale: obj.ry * (obj.scaleY || 1) * scaleRatio,
      opacity: obj.opacity || 1,
    };

    if (color) drawOpts.color = rgb(color.r / 255, color.g / 255, color.b / 255);
    if (strokeColor) {
      drawOpts.borderColor = rgb(strokeColor.r / 255, strokeColor.g / 255, strokeColor.b / 255);
      drawOpts.borderWidth = (obj.strokeWidth || 1) * scaleRatio;
    }

    page.drawEllipse(drawOpts);
  } else if (type === 'line') {
    const strokeColor = hexToRgb(obj.stroke || '#000000');
    page.drawLine({
      start: { x: obj.x1 * scaleRatio, y: pageH - obj.y1 * scaleRatio },
      end: { x: obj.x2 * scaleRatio, y: pageH - obj.y2 * scaleRatio },
      thickness: (obj.strokeWidth || 2) * scaleRatio,
      color: rgb(strokeColor.r / 255, strokeColor.g / 255, strokeColor.b / 255),
      opacity: obj.opacity || 1,
    });
  } else if (type === 'path') {
    // Freehand drawing - render as image overlay
    await renderFabricObjectAsImage(pdfDoc, page, obj, scaleRatio, pageH);
  } else if (type === 'image') {
    await renderFabricImageToPDF(pdfDoc, page, obj, scaleRatio, pageH);
  } else if (type === 'group') {
    // Groups (like arrows) - render each child
    const groupObjects = obj.getObjects();
    for (const child of groupObjects) {
      // Adjust child coordinates
      const offsetX = obj.left + obj.width / 2;
      const offsetY = obj.top + obj.height / 2;
      const adjusted = fabric.util.object.clone(child);
      adjusted.left = (adjusted.left || 0) + offsetX;
      adjusted.top = (adjusted.top || 0) + offsetY;
      adjusted.opacity = obj.opacity;
      await renderObjectToPDF(pdfDoc, page, adjusted, scaleRatio, pageH);
    }
  }
}

async function renderFabricObjectAsImage(pdfDoc, page, obj, scaleRatio, pageH) {
  // Render path/complex objects as PNG and embed
  const tempCanvas = document.createElement('canvas');
  const bounds = obj.getBoundingRect();
  tempCanvas.width = bounds.width;
  tempCanvas.height = bounds.height;
  const ctx = tempCanvas.getContext('2d');

  const cloned = fabric.util.object.clone(obj);
  cloned.left = cloned.left - bounds.left;
  cloned.top = cloned.top - bounds.top;
  cloned.setCoords();

  const tempFabric = new fabric.StaticCanvas(tempCanvas);
  tempFabric.add(cloned);
  tempFabric.renderAll();

  const dataUrl = tempCanvas.toDataURL('image/png');
  const base64 = dataUrl.split(',')[1];
  const imgBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const img = await pdfDoc.embedPng(imgBytes);

  page.drawImage(img, {
    x: bounds.left * scaleRatio,
    y: pageH - bounds.top * scaleRatio - bounds.height * scaleRatio,
    width: bounds.width * scaleRatio,
    height: bounds.height * scaleRatio,
    opacity: obj.opacity || 1,
  });
}

async function renderFabricImageToPDF(pdfDoc, page, obj, scaleRatio, pageH) {
  try {
    const src = obj.getSrc();
    if (!src) return;

    const response = await fetch(src);
    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    let img;
    if (src.includes('image/png')) {
      img = await pdfDoc.embedPng(bytes);
    } else {
      img = await pdfDoc.embedJpg(bytes);
    }

    const w = obj.width * (obj.scaleX || 1);
    const h = obj.height * (obj.scaleY || 1);

    page.drawImage(img, {
      x: obj.left * scaleRatio,
      y: pageH - obj.top * scaleRatio - h * scaleRatio,
      width: w * scaleRatio,
      height: h * scaleRatio,
      opacity: obj.opacity || 1,
    });
  } catch (err) {
    console.error('Error embedding image:', err);
  }
}

// ===== Utility =====
function hexToRgb(hex) {
  if (!hex || hex === 'transparent') return { r: 0, g: 0, b: 0 };
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  return {
    r: parseInt(hex.substr(0, 2), 16),
    g: parseInt(hex.substr(2, 2), 16),
    b: parseInt(hex.substr(4, 2), 16),
  };
}

// ===== Scroll tracking for current page =====
const canvasScroll = $('canvas-scroll');
if (canvasScroll) {
  canvasScroll.addEventListener('scroll', () => {
    const wrappers = pageContainer.children;
    const scrollTop = canvasScroll.scrollTop;
    const scrollCenter = scrollTop + canvasScroll.clientHeight / 2;

    for (let i = 0; i < wrappers.length; i++) {
      const wrapper = wrappers[i];
      const top = wrapper.offsetTop;
      const bottom = top + wrapper.offsetHeight;
      if (scrollCenter >= top && scrollCenter <= bottom) {
        state.currentPage = i + 1;
        updatePageUI();
        break;
      }
    }
  });
}

// ===== Start =====
init();
