/**
 * Injectable JavaScript strings for agent DOM interaction within the browser panel.
 * These are executed inside the WebContentsView via webContents.executeJavaScript().
 * Ported from LiteEditor's dom-helper.ts.
 */

/** IIFE that indexes all interactive elements visible in the viewport */
export const DOM_INDEX_SCRIPT = `(function() {
  const INTERACTIVE_SELECTORS = [
    'a[href]', 'button', 'input', 'textarea', 'select',
    '[role="button"]', '[role="link"]', '[role="checkbox"]',
    '[role="radio"]', '[role="tab"]', '[role="menuitem"]',
    '[tabindex]', '[contenteditable="true"]',
    'details > summary'
  ];

  function isVisible(el) {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    return true;
  }

  function isInViewport(el) {
    const rect = el.getBoundingClientRect();
    return (
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth
    );
  }

  // Remove old indices
  document.querySelectorAll('[data-agent-idx]').forEach(el => el.removeAttribute('data-agent-idx'));

  const allElements = document.querySelectorAll(INTERACTIVE_SELECTORS.join(', '));
  const elements = [];
  let idx = 0;

  for (const el of allElements) {
    if (!isVisible(el) || !isInViewport(el)) continue;

    el.setAttribute('data-agent-idx', String(idx));
    const rect = el.getBoundingClientRect();
    const info = {
      index: idx,
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type') || undefined,
      text: (el.textContent || '').trim().substring(0, 200),
      role: el.getAttribute('role') || undefined,
      bounds: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
      value: el.value !== undefined ? String(el.value).substring(0, 200) : undefined,
      placeholder: el.getAttribute('placeholder') || undefined,
      href: el.getAttribute('href') || undefined,
      checked: el.checked !== undefined ? el.checked : undefined,
      ariaLabel: el.getAttribute('aria-label') || undefined,
      name: el.getAttribute('name') || undefined
    };

    // Clean undefined values
    Object.keys(info).forEach(k => { if (info[k] === undefined) delete info[k]; });
    elements.push(info);
    idx++;
  }

  const bodyText = document.body ? document.body.innerText : '';
  const visibleText = bodyText.substring(0, 5000);

  return {
    url: window.location.href,
    title: document.title,
    elements: elements,
    visibleText: visibleText
  };
})()`;

/** Click the element with the given data-agent-idx */
export function getClickScript(index: number): string {
  return `(function() {
    const el = document.querySelector('[data-agent-idx="${index}"]');
    if (!el) return { success: false, error: 'Element not found with index ${index}' };
    el.scrollIntoView({ behavior: 'instant', block: 'center' });
    el.click();
    return { success: true };
  })()`;
}

/** Type text into an element. If index is provided, focuses that element first. */
export function getTypeScript(text: string, index?: number): string {
  const escaped = text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$")
    .replace(/\n/g, "\\n");
  if (index !== undefined) {
    return `(function() {
      const el = document.querySelector('[data-agent-idx="${index}"]');
      if (!el) return { success: false, error: 'Element not found with index ${index}' };
      el.scrollIntoView({ behavior: 'instant', block: 'center' });
      el.focus();
      if ('value' in el) {
        el.value = '${escaped}';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (el.isContentEditable) {
        el.textContent = '${escaped}';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return { success: true };
    })()`;
  }
  return `(function() {
    const el = document.activeElement;
    if (!el) return { success: false, error: 'No focused element' };
    if ('value' in el) {
      el.value = '${escaped}';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (el.isContentEditable) {
      el.textContent = '${escaped}';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return { success: true };
  })()`;
}

/** Scroll the page in a direction by a given amount (pixels) */
export function getScrollScript(
  direction: 'up' | 'down' | 'left' | 'right',
  amount: number,
): string {
  const xMap: Record<string, number> = { left: -1, right: 1, up: 0, down: 0 };
  const yMap: Record<string, number> = { up: -1, down: 1, left: 0, right: 0 };
  const x = xMap[direction] * amount;
  const y = yMap[direction] * amount;
  return `(function() {
    window.scrollBy(${x}, ${y});
    return { success: true, scrollX: window.scrollX, scrollY: window.scrollY };
  })()`;
}

/** Select an option in a <select> element by option index */
export function getSelectScript(elementIndex: number, optionIndex: number): string {
  return `(function() {
    const el = document.querySelector('[data-agent-idx="${elementIndex}"]');
    if (!el) return { success: false, error: 'Element not found with index ${elementIndex}' };
    if (el.tagName.toLowerCase() !== 'select') return { success: false, error: 'Element is not a select' };
    if (optionIndex < 0 || optionIndex >= el.options.length) return { success: false, error: 'Option index out of range' };
    el.selectedIndex = ${optionIndex};
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { success: true, selectedValue: el.value };
  })()`;
}
