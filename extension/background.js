// apps/resurface/extension/background.js

/* global browser, chrome */

const INGEST_PATH = '/api/ingest/extension'
const LEGACY_LOCAL_ENDPOINT = `http://localhost:7790${INGEST_PATH}`
const DEFAULT_ENDPOINT = `https://wills-mac-mini.taild4212d.ts.net:7790${INGEST_PATH}`

function extensionApi() {
  if (typeof browser !== 'undefined') {
    return browser
  }
  return chrome
}

function normalizeEndpointUrl(endpointUrl) {
  const trimmed = typeof endpointUrl === 'string' ? endpointUrl.trim() : ''
  if (!trimmed) {
    throw new Error('Endpoint URL is required')
  }

  const parsed = new URL(trimmed)
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Endpoint must use HTTP or HTTPS')
  }

  if (parsed.pathname === '' || parsed.pathname === '/') {
    parsed.pathname = INGEST_PATH
  }

  const normalizedPath = parsed.pathname.replace(/\/+$/, '')
  if (normalizedPath !== INGEST_PATH) {
    throw new Error(`Endpoint must point to ${INGEST_PATH}`)
  }

  parsed.pathname = INGEST_PATH
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString()
}

function getEndpointUrl(api) {
  return new Promise((resolve) => {
    api.storage.local.get({ endpointUrl: DEFAULT_ENDPOINT }, (stored) => {
      const rawValue =
        typeof stored.endpointUrl === 'string' &&
        stored.endpointUrl.trim().length > 0
          ? stored.endpointUrl.trim()
          : DEFAULT_ENDPOINT
      if (rawValue === LEGACY_LOCAL_ENDPOINT) {
        api.storage.local.set({ endpointUrl: DEFAULT_ENDPOINT })
        resolve({
          endpointUrl: DEFAULT_ENDPOINT,
          resetFromInvalid: true,
          invalidEndpointUrl: rawValue,
        })
        return
      }
      try {
        resolve({
          endpointUrl: normalizeEndpointUrl(rawValue),
          resetFromInvalid: false,
        })
      } catch {
        api.storage.local.set({ endpointUrl: DEFAULT_ENDPOINT })
        resolve({
          endpointUrl: DEFAULT_ENDPOINT,
          resetFromInvalid: rawValue !== DEFAULT_ENDPOINT,
          invalidEndpointUrl: rawValue,
        })
      }
    })
  })
}

function setEndpointUrl(api, endpointUrl) {
  return new Promise((resolve) => {
    api.storage.local.set({ endpointUrl }, () => resolve())
  })
}

function queryActiveTab(api) {
  return new Promise((resolve) => {
    api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(Array.isArray(tabs) ? tabs[0] : null)
    })
  })
}

function sendTabMessage(api, tabId, message) {
  return new Promise((resolve, reject) => {
    api.tabs.sendMessage(tabId, message, (response) => {
      if (api.runtime.lastError) {
        reject(new Error(api.runtime.lastError.message))
        return
      }
      resolve(response)
    })
  })
}

function injectContentScript(api, tabId) {
  return new Promise((resolve, reject) => {
    if (!api.scripting || typeof api.scripting.executeScript !== 'function') {
      reject(new Error('Content script is not available in this tab'))
      return
    }

    api.scripting.executeScript(
      {
        target: { tabId },
        files: ['content.js'],
      },
      () => {
        if (api.runtime.lastError) {
          reject(new Error(api.runtime.lastError.message))
          return
        }

        resolve()
      }
    )
  })
}

async function extractPageCapture(api, tabId) {
  const message = { type: 'extract-page-capture' }

  try {
    return await sendTabMessage(api, tabId, message)
  } catch (error) {
    const detail = error instanceof Error ? error.message : ''
    if (!detail.includes('Receiving end does not exist')) {
      throw error
    }

    await injectContentScript(api, tabId)
    return sendTabMessage(api, tabId, message)
  }
}

function parseJsonSafe(text) {
  if (!text) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function captureActiveTab(api) {
  const tab = await queryActiveTab(api)
  if (!tab || typeof tab.id !== 'number') {
    throw new Error('No active tab available for capture')
  }

  const payload = await extractPageCapture(api, tab.id)

  if (!payload || typeof payload !== 'object') {
    throw new Error('Could not extract page data from the current tab')
  }

  const endpointState = await getEndpointUrl(api)
  const endpointUrl = endpointState.endpointUrl
  const response = await fetch(endpointUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const responseText = await response.text()
  const responseJson = parseJsonSafe(responseText)

  if (!response.ok) {
    const message =
      responseJson && typeof responseJson.error === 'string'
        ? responseJson.error
        : `Resurface endpoint responded with ${response.status}`
    throw new Error(message)
  }

  return {
    endpointUrl,
    resetFromInvalid: endpointState.resetFromInvalid,
    statusCode: response.status,
    response: responseJson,
  }
}

extensionApi().runtime.onMessage.addListener(
  (message, _sender, sendResponse) => {
    const api = extensionApi()

    if (message && message.type === 'capture-active-tab') {
      captureActiveTab(api)
        .then((result) => {
          sendResponse({ ok: true, result })
        })
        .catch((error) => {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : 'Capture failed',
          })
        })
      return true
    }

    if (message && message.type === 'get-endpoint-url') {
      getEndpointUrl(api)
        .then((endpointState) => sendResponse({ ok: true, ...endpointState }))
        .catch((error) => {
          sendResponse({
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : 'Failed to load endpoint',
          })
        })
      return true
    }

    if (message && message.type === 'get-active-tab-summary') {
      queryActiveTab(api)
        .then((tab) =>
          sendResponse({
            ok: true,
            url: tab && typeof tab.url === 'string' ? tab.url : '',
            title: tab && typeof tab.title === 'string' ? tab.title : '',
          })
        )
        .catch((error) => {
          sendResponse({
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : 'Failed to read active tab',
          })
        })
      return true
    }

    if (message && message.type === 'set-endpoint-url') {
      const endpointUrl =
        typeof message.endpointUrl === 'string'
          ? message.endpointUrl.trim()
          : ''

      let normalizedEndpointUrl
      try {
        normalizedEndpointUrl = normalizeEndpointUrl(endpointUrl)
      } catch (error) {
        sendResponse({
          ok: false,
          error:
            error instanceof Error ? error.message : 'Endpoint URL is invalid',
        })
        return false
      }

      setEndpointUrl(api, normalizedEndpointUrl)
        .then(() =>
          sendResponse({ ok: true, endpointUrl: normalizedEndpointUrl })
        )
        .catch((error) => {
          sendResponse({
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : 'Failed to save endpoint',
          })
        })
      return true
    }

    return false
  }
)
