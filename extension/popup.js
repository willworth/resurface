// extension/popup.js

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
    setStatus(statusElement, detail, 'success')
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
  const saveButton = document.getElementById('save-endpoint-button')
  const captureButton = document.getElementById('capture-button')

  if (!(statusElement instanceof HTMLElement)) {
    return
  }

  if (!(endpointInput instanceof HTMLInputElement)) {
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

  await loadEndpoint(endpointInput, statusElement)
  await captureCurrentPage(statusElement)
})
