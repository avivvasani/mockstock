const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // For saving: Expects an object with userId and fileBase64
    savePortfolioBackground: (userId, fileBase64) => 
        ipcRenderer.invoke('write-portfolio-background', { userId, fileBase64 }),
    
    // For reading: Expects just the userId string
    readPortfolio: (userId) => 
        ipcRenderer.invoke('read-portfolio', userId)
});