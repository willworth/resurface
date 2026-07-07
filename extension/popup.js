// apps/resurface/extension/popup.js

/* global browser, chrome */

function extensionApi() {
  if (typeof browser !== 'undefined') {
    return browser
  }
  return chrome
}

function sendRuntimeMessage(message) {
  const api = extensionApi()
  return new Promise((resolve, reject) => {
    api.runtime.sendMessage(message, (response) => {
      if (api.runtime.lastError) {
        reject(new Error(api.runtime.lastError.message))
        return
      }
      resolve(response)
    })
  })
}

function setStatus(element, text, kind) {
  element.textContent = text
  element.classList.remove('success', 'error')
  if (kind === 'success' || kind === 'error') {
    element.classList.add(kind)
  }
}

function describeCapture(result) {
  const response =
    result && result.response && typeof result.response === 'object'
      ? result.response
      : null
  if (!response) {
    return 'Saved to Resurface.'
  }

  if (response.status === 'duplicate') {
    return 'Already saved in Resurface (duplicate detected).'
  }

  return `Saved to Resurface as ${response.category || 'capture'}.`
}

async function loadEndpoint(endpointInput, statusElement) {
  try {
    const message = await sendRuntimeMessage({ type: 'get-endpoint-url' })
    if (message && message.ok && typeof message.endpointUrl === 'string') {
      endpointInput.value = message.endpointUrl
      if (message.resetFromInvalid) {
        setStatus(
          statusElement,
          'Saved endpoint was not a Resurface ingest URL; using the default endpoint.',
          'error'
        )
      }
      return
    }

    setStatus(statusElement, 'Could not load endpoint URL.', 'error')
  } catch (error) {
    setStatus(
      statusElement,
      error instanceof Error ? error.message : 'Failed to load endpoint URL.',
      'error'
    )
  }
}

async function loadActiveTab(pageUrlInput, statusElement) {
  try {
    const message = await sendRuntimeMessage({ type: 'get-active-tab-summary' })
    if (message && message.ok && typeof message.url === 'string') {
      pageUrlInput.value = message.url
      return
    }

    setStatus(statusElement, 'Could not read active tab URL.', 'error')
  } catch (error) {
    setStatus(
      statusElement,
      error instanceof Error ? error.message : 'Failed to read active tab URL.',
      'error'
    )
  }
}

async function saveEndpoint(endpointInput, statusElement) {
  const endpointUrl = endpointInput.value.trim()

  try {
    const message = await sendRuntimeMessage({
      type: 'set-endpoint-url',
      endpointUrl,
    })

    if (!message || !message.ok) {
      throw new Error(
        message && message.error ? message.error : 'Failed to save endpoint'
      )
    }

    setStatus(
      statusElement,
      `Endpoint saved: ${message.endpointUrl}`,
      'success'
    )
  } catch (error) {
    setStatus(
      statusElement,
      error instanceof Error ? error.message : 'Failed to save endpoint URL.',
      'error'
    )
  }
}

async function captureCurrentPage(statusElement) {
  setStatus(statusElement, 'Capturing current page...', null)

  try {
    const message = await sendRuntimeMessage({ type: 'capture-active-tab' })

    if (!message || !message.ok) {
      throw new Error(
        message && message.error ? message.error : 'Capture failed'
      )
    }

    const detail = describeCapture(message.result)
    const prefix =
      message.result && message.result.resetFromInvalid
        ? 'Saved endpoint was not a Resurface ingest URL, so the default endpoint was used. '
        : ''
    setStatus(statusElement, `${prefix}${detail}`, 'success')
  } catch (error) {
    setStatus(
      statusElement,
      error instanceof Error ? error.message : 'Capture failed.',
      'error'
    )
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const statusElement = document.getElementById('status')
  const endpointInput = document.getElementById('endpoint-input')
  const pageUrlInput = document.getElementById('page-url-input')
  const saveButton = document.getElementById('save-endpoint-button')
  const captureButton = document.getElementById('capture-button')

  if (!(statusElement instanceof HTMLElement)) {
    return
  }

  if (!(endpointInput instanceof HTMLInputElement)) {
    return
  }

  if (!(pageUrlInput instanceof HTMLInputElement)) {
    return
  }

  if (saveButton instanceof HTMLButtonElement) {
    saveButton.addEventListener('click', () => {
      saveEndpoint(endpointInput, statusElement)
    })
  }

  if (captureButton instanceof HTMLButtonElement) {
    captureButton.addEventListener('click', () => {
      captureCurrentPage(statusElement)
    })
  }

  await loadActiveTab(pageUrlInput, statusElement)
  await loadEndpoint(endpointInput, statusElement)
  await captureCurrentPage(statusElement)
})
