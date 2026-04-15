const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'PDFy',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    frame: true,
    backgroundColor: '#ffffff',
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // Log renderer errors
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    if (level >= 2) console.log(`[RENDERER] ${message}`);
  });
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.log('[CRASH]', details);
  });

  const menu = Menu.buildFromTemplate([
    {
      label: 'Archivo',
      submenu: [
        { label: 'Abrir PDF', accelerator: 'CmdOrCtrl+O', click: () => openFile() },
        { label: 'Guardar', accelerator: 'CmdOrCtrl+S', click: () => mainWindow.webContents.send('save-file') },
        { label: 'Guardar como...', accelerator: 'CmdOrCtrl+Shift+S', click: () => saveFileAs() },
        { type: 'separator' },
        { label: 'Salir', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
      ],
    },
    {
      label: 'Editar',
      submenu: [
        { label: 'Deshacer', accelerator: 'CmdOrCtrl+Z', click: () => mainWindow.webContents.send('undo') },
        { label: 'Rehacer', accelerator: 'CmdOrCtrl+Y', click: () => mainWindow.webContents.send('redo') },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { label: 'Acercar', accelerator: 'CmdOrCtrl+=', click: () => mainWindow.webContents.send('zoom-in') },
        { label: 'Alejar', accelerator: 'CmdOrCtrl+-', click: () => mainWindow.webContents.send('zoom-out') },
        { label: 'Ajustar a ventana', accelerator: 'CmdOrCtrl+0', click: () => mainWindow.webContents.send('zoom-fit') },
        { type: 'separator' },
        { label: 'Dev Tools', accelerator: 'F12', click: () => mainWindow.webContents.toggleDevTools() },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

async function openFile() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Abrir PDF',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
    properties: ['openFile'],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    const data = fs.readFileSync(filePath);
    mainWindow.webContents.send('file-opened', {
      data: data.toString('base64'),
      path: filePath,
      name: path.basename(filePath),
    });
  }
}

async function saveFileAs() {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Guardar PDF como...',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
    defaultPath: 'documento.pdf',
  });
  if (!result.canceled && result.filePath) {
    mainWindow.webContents.send('save-file-as', { path: result.filePath });
  }
}

ipcMain.handle('open-file-dialog', async () => {
  await openFile();
});

ipcMain.handle('save-file-dialog', async () => {
  await saveFileAs();
});

ipcMain.handle('write-file', async (event, { filePath, data }) => {
  const buffer = Buffer.from(data, 'base64');
  fs.writeFileSync(filePath, buffer);
  return { success: true, path: filePath };
});

ipcMain.handle('open-image-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Seleccionar imagen',
    filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] }],
    properties: ['openFile'],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase().replace('.', '');
    const mime = ext === 'jpg' ? 'jpeg' : ext;
    return { data: `data:image/${mime};base64,${data.toString('base64')}`, name: path.basename(filePath) };
  }
  return null;
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
