function uniqueID() {
  return 'xxxxxxxx'.replace(/x/g, () => Math.floor(16 * Math.random()).toString(16));
}

export class AttributeList {
  constructor(prefix='data-') {
    this.cache = new WeakMap();
    this.baseName = prefix + uniqueID() + '-';
  }

  resolve(attrName) { return this.baseName + attrName; }

  has(element, attrName) { return this.cache.get(element).has(attrName); }

  toggle(element, attrName, condition) {
    if (!this.cache.has(element)) this.cache.set(element, new Set());
    const attrCache = this.cache.get(element);

    if (arguments.length === 2) condition = !attrCache.has(attrName);  // no third argument passed

    // Return early if nothing has changed to avoid unnecessary DOM manipulation
    // Note: use of `==` is intentional to allow truthy/falsy conditions
    if (condition == attrCache.has(attrName)) return;

    if (condition) {
      element.setAttributeNS(null, this.resolve(attrName), '');
      attrCache.add(attrName);
    }
    else {
      element.removeAttributeNS(null, this.resolve(attrName));
      attrCache.delete(attrName);
    }
  }

  add(element, attrName) { this.toggle(element, attrName, true); }

  remove(element, attrName) { this.toggle(element, attrName, false); }

  removeAll(element) {
    if (!this.cache.has(element)) return;
    this.cache.get(element).forEach(attrName => this.toggle(element, attrName, false));
  }
}

export function injectStyleSheet(innerHTML) {
  const styleElement = document.createElement("style");
  styleElement.innerHTML = innerHTML;
  document.head.appendChild(styleElement);
}

// Setting innerHTML on an SVG element does not work on Edge
// We parse our XML using DOMParser instead:
// https://developer.mozilla.org/en-US/docs/Web/API/DOMParser
export function injectSVGDefs(xmlStr) {
  let canvas = document.getElementById('si-canvas'),
      defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  xmlStr = '<svg xmlns=\'http://www.w3.org/2000/svg\'>' + xmlStr + '</svg>';
  let svgDocElement = new DOMParser().parseFromString(xmlStr, 'text/xml').documentElement;
  // Do not use svgDocElement.children, no support on Safari & Edge:
  // https://developer.mozilla.org/en-US/docs/Web/API/ParentNode/children
  // Loop through childNodes instead.
  let childNode = svgDocElement.firstChild;
  while(childNode) {
    if (childNode.nodeType === 1) { // Only append Element nodes
      defs.appendChild(canvas.ownerDocument.importNode(childNode, true));
    }
    childNode = childNode.nextSibling;
  }
  canvas.insertBefore(defs, canvas.firstChild);
}
