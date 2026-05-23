/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, shell } = require('electron')
const path = require('path')
const fs = require('fs')

const DEFAULT_RESURFACE_URL = 'https://wills-mac-mini.taild4212d.ts.net:7790/'
const RESURFACE_LOAD_TIMEOUT_MS = 5000
const RESURFACE_RETRY_AFTER_FAILURE_MS = 10000

let mainWindow = null
let retryTimeoutId = null

function settingsFilePath() {
  return path.join(app.getPath('userData'), 'desktop-settings.json')
}

function normalizeUrl(raw) {
  if (typeof raw !== 'string') {
    return null
  }

  const trimmed = raw.trim()
  if (!trimmed) {
    return null
  }

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    return parsed.toString()
  } catch {
    return null
  }
}

function loadSettingsUrl() {
  const filePath = settingsFilePath()
  if (!fs.existsSync(filePath)) {
    return null
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw)
    return normalizeUrl(parsed?.resurfaceUrl)
  } catch {
    return null
  }
}

function resolveResurfaceUrl() {
  return (
    normalizeUrl(process.env.RESURFACE_DESKTOP_URL) ||
    loadSettingsUrl() ||
    DEFAULT_RESURFACE_URL
  )
}

function allowedOrigin() {
  const resolved = normalizeUrl(resolveResurfaceUrl())
  return resolved ? new URL(resolved).origin : null
}

function isAllowedNavigation(rawUrl) {
  const normalized = normalizeUrl(rawUrl)
  const origin = allowedOrigin()

  if (!normalized || !origin) {
    return false
  }

  return new URL(normalized).origin === origin
}

function openExternal(url) {
  if (typeof url !== 'string') {
    return
  }

  if (url.startsWith('http://') || url.startsWith('https://')) {
    void shell.openExternal(url)
  }
}

function renderLoadFailure(url, error) {
  const message =
    error instanceof Error ? error.message : 'Resurface could not be reached.'

  return '<!doctype html>' +
    '<html><head><meta charset="utf-8" />' +
    '<title>Resurface unavailable</title>' +
    '<style>' +
    'body{align-items:center;background:#171514;color:#f2eadf;display:flex;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;justify-content:center;margin:0;min-height:100vh;}' +
    'main{border-bottom:1px solid rgba(242,234,223,0.35);border-top:1px solid rgba(242,234,223,0.7);max-width:680px;padding:32px 0;width:min(680px,calc(100vw - 48px));}' +
    'h1{font-family:Georgia,serif;font-size:48px;font-style:italic;font-weight:400;margin:0 0 8px;}' +
    'p{color:#d6c8b8;line-height:1.55;}' +
    'code{color:#f2eadf;}' +
    '</style></head><body><main>' +
    '<h1>Resurface is unreachable</h1>' +
    '<p>The desktop app could not load the remote Resurface service.</p>' +
    '<p><code>' + url + '</code></p>' +
    '<p><code>' + message + '</code></p>' +
    '</main></body></html>'
}

async function loadUrlWithTimeout(browserWindow, url) {
  let timeoutId = null
  const loadPromise = browserWindow.loadURL(url)
  loadPromise.catch(() => {})

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('Timed out loading ' + url))
    }, RESURFACE_LOAD_TIMEOUT_MS)
  })

  try {
    await Promise.race([loadPromise, timeoutPromise])
  } finally {
    clearTimeout(timeoutId)
  }
}

async function loadResurface(browserWindow) {
  if (retryTimeoutId) {
    clearTimeout(retryTimeoutId)
    retryTimeoutId = null
  }

  const url = resolveResurfaceUrl()

  try {
    await loadUrlWithTimeout(browserWindow, url)
  } catch (error) {
    browserWindow.webContents.stop()
    await browserWindow.loadURL(
      'data:text/html;charset=utf-8,' + encodeURIComponent(
        renderLoadFailure(url, error)
      )
    )

    retryTimeoutId = setTimeout(() => {
      if (!browserWindow.isDestroyed()) {
        void loadResurface(browserWindow)
      }
    }, RESURFACE_RETRY_AFTER_FAILURE_MS)
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 700,
    title: 'Resurface',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedNavigation(url)) {
      return { action: 'allow' }
    }

    openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAllowedNavigation(url)) {
      return
    }

    event.preventDefault()
    openExternal(url)
  })

  await loadResurface(mainWindow)
}

app.whenReady().then(async () => {
  await createWindow()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (retryTimeoutId) {
    clearTimeout(retryTimeoutId)
    retryTimeoutId = null
  }

  if (process.platform !== 'darwin') {
    app.quit()
  }
})
