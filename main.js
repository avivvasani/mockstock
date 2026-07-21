const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs'); 

let win;
const activeChartWindows = {};

app.commandLine.appendSwitch('ignore-certificate-errors');

function createWindow() {
  win = new BrowserWindow({ 
    width: 1920, 
    height: 1080,
    icon: path.join(__dirname, 'assets/icon.png'), 
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false // Matches the direct manual require framework usage
    }
  });

  win.loadFile('index.html'); 
}

// RESTORED: Other application modules can continue leveraging this channel pipeline to modify JSON portfolios
ipcMain.handle('write-portfolio-background', async (event, { userId, jsonString }) => {
  try {
    const saveDirectory = path.join(app.getPath('userData'), 'Portfolios');
    if (!fs.existsSync(saveDirectory)) {
        fs.mkdirSync(saveDirectory, { recursive: true });
    }

    const fileName = `${userId}_portfolio.json`;
    const filePath = path.join(saveDirectory, fileName);
    
    fs.writeFileSync(filePath, jsonString, 'utf8');
    console.log(`[AUTOMATION] Plain JSON portfolio silently saved at: ${filePath}`);
    return { success: true, path: filePath };
  } catch (error) {
    console.error('[AUTOMATION ERROR] Failed plain text background write:', error);
    return { success: false, error: error.message };
  }
});

// FIXED: Adaptive structural lookup tracking supporting case differences across workspace frameworks
ipcMain.handle('read-portfolio', async (event, userId) => {
    try {
        const saveDirectory = path.join(app.getPath('userData'), 'Portfolios');
        
        if (!fs.existsSync(saveDirectory)) {
            return { success: false, error: "Portfolios folder directory absent." };
        }

        let targetFileName = `${userId}_portfolio.json`;
        let filePath = path.join(saveDirectory, targetFileName);

        // Fallback fallback: Search directory if an exact casing filename match cannot be found
        if (!fs.existsSync(filePath)) {
            const files = fs.readdirSync(saveDirectory);
            const matchedFile = files.find(file => file.toLowerCase() === targetFileName.toLowerCase());
            if (matchedFile) {
                filePath = path.join(saveDirectory, matchedFile);
            } else {
                return { success: false, error: "Database file lookup mismatch or absent resource entry." };
            }
        }

        const data = fs.readFileSync(filePath, 'utf8');
        return { success: true, data: JSON.parse(data) };
    } catch (error) {
        console.error('[DATABASE READ ERROR] Failed to pull ledger target context:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.on('open-chart-window', (event, symbol) => {
  const upperSymbol = symbol.toUpperCase();

  if (activeChartWindows[upperSymbol]) {
    activeChartWindows[upperSymbol].focus();
    return;
  }

  let chartWindow = new BrowserWindow({
    width: 1200, 
    height: 800,
    title: `Live Chart - ${upperSymbol}`,
    icon: path.join(__dirname, 'assets/icon.png'), 
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      partition: `persist:chart-${upperSymbol}` 
    }
  });

  activeChartWindows[upperSymbol] = chartWindow;
  
  const chartUrl = `https://www.tradingview.com/chart/?symbol=NSE:${upperSymbol}&theme=light`;
  chartWindow.loadURL(chartUrl);

  chartWindow.webContents.on('will-prevent-unload', (unloadEvent) => {
    unloadEvent.preventDefault(); 
  });

  chartWindow.on('close', (closeEvent) => {
    if (chartWindow) {
      chartWindow.destroy(); 
    }
  });

  chartWindow.on('closed', () => {
    delete activeChartWindows[upperSymbol];
  });
});

ipcMain.on('close-all-charts', () => {
  Object.keys(activeChartWindows).forEach((symbol) => {
    if (activeChartWindows[symbol] && !activeChartWindows[symbol].isDestroyed()) {
      activeChartWindows[symbol].destroy(); 
    }
  });
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});