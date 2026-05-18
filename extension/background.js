// extension/background.js

/* global browser, chrome */

const DEFAULT_ENDPOINT =
  'https://wills-mac-mini.taild4212d.ts.net:7790/api/ingest/extension'

function extensionApi() {
  if (typeof browser !== 'undefined') {
    return browser
  }
  return chrome
}

function getEndpointUrl(api) {
  return new Promise((resolve) => {
    api.storage.local.get({ endpointUrl: DEFAULT_ENDPOINT }, (stored) => {
      const value =
        typeof stored.endpointUrl === 'string' &&
        stored.endpointUrl.trim().length > 0
          ? stored.endpointUrl.trim()
          : DEFAULT_ENDPOINT
      resolve(value)
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

  const payload = await sendTabMessage(api, tab.id, {
    type: 'extract-page-capture',
  })

  if (!payload || typeof payload !== 'object') {
    throw new Error('Could not extract page data from the current tab')
  }

  const endpointUrl = await getEndpointUrl(api)
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
        .then((endpointUrl) => sendResponse({ ok: true, endpointUrl }))
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

    if (message && message.type === 'set-endpoint-url') {
      const endpointUrl =
        typeof message.endpointUrl === 'string'
          ? message.endpointUrl.trim()
          : ''

      if (!endpointUrl) {
        sendResponse({ ok: false, error: 'Endpoint URL is required' })
        return false
      }

      try {
        const parsed = new URL(endpointUrl)
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          sendResponse({ ok: false, error: 'Endpoint must use HTTP or HTTPS' })
          return false
        }
      } catch {
        sendResponse({ ok: false, error: 'Endpoint URL is invalid' })
        return false
      }

      setEndpointUrl(api, endpointUrl)
        .then(() => sendResponse({ ok: true, endpointUrl }))
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
