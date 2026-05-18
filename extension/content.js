// extension/content.js

/* global chrome */

const MAX_CONTENT_LENGTH = 24000
const MAX_SELECTION_LENGTH = 4000

function normalizeText(value) {
  return value.replace(/\s+/g, ' ').trim()
}

function getMetaValue(selector) {
  const node = document.querySelector(selector)
  const content =
    node && typeof node.getAttribute === 'function'
      ? node.getAttribute('content')
      : null
  if (!content) {
    return null
  }

  const trimmed = content.trim()
  return trimmed.length > 0 ? trimmed : null
}

function getSelectedText() {
  const selected = window.getSelection ? window.getSelection() : null
  if (!selected) {
    return null
  }

  const text = normalizeText(selected.toString())
  if (!text) {
    return null
  }

  return text.slice(0, MAX_SELECTION_LENGTH)
}

function removeUnwantedNodes(root) {
  const selectors = [
    'script',
    'style',
    'noscript',
    'svg',
    'canvas',
    'form',
    'nav',
    'footer',
    'header',
    'aside',
    'iframe',
    'button',
  ]

  selectors.forEach((selector) => {
    root.querySelectorAll(selector).forEach((node) => node.remove())
  })
}

function extractMainContent() {
  const articleRoot =
    document.querySelector('article') ||
    document.querySelector('main') ||
    document.querySelector('[role="main"]') ||
    document.body

  if (!articleRoot) {
    return ''
  }

  const clone = articleRoot.cloneNode(true)
  if (clone && clone.nodeType === Node.ELEMENT_NODE) {
    removeUnwantedNodes(clone)
  }

  const raw = clone.textContent || ''
  const cleaned = normalizeText(raw)
  return cleaned.slice(0, MAX_CONTENT_LENGTH)
}

function buildCapturePayload() {
  const title = normalizeText(document.title || '')
  const selectedText = getSelectedText()
  const metaDescription =
    getMetaValue('meta[name="description"]') ||
    getMetaValue('meta[property="og:description"]')

  return {
    url: window.location.href,
    title: title || null,
    selectedText,
    content: extractMainContent(),
    metaDescription,
    ogImage: getMetaValue('meta[property="og:image"]'),
  }
}

function sendPayload(sendResponse) {
  try {
    const payload = buildCapturePayload()
    sendResponse(payload)
  } catch (error) {
    sendResponse({
      url: window.location.href,
      title: document.title || null,
      selectedText: null,
      content: '',
      metaDescription: null,
      ogImage: null,
      extractError:
        error instanceof Error ? error.message : 'Failed to read page content',
    })
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'extract-page-capture') {
    return false
  }

  sendPayload(sendResponse)
  return true
})
