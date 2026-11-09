import { createHmac, timingSafeEqual } from 'node:crypto';
import createDOMPurify from 'dompurify';
import { MAX_SVG_BYTES, SVG_TYPE } from './config.js';

export class SvgValidationError extends Error {}
const namespace = 'http://www.w3.org/2000/svg';
const tags = [
  'svg',
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'defs',
  'linearGradient',
  'radialGradient',
  'stop',
  'clipPath',
  'mask',
  'title',
  'desc',
];
const attributes = [
  'xmlns',
  'viewBox',
  'width',
  'height',
  'x',
  'y',
  'x1',
  'x2',
  'y1',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'd',
  'points',
  'id',
  'fill',
  'fill-rule',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'opacity',
  'transform',
  'clip-path',
  'clip-rule',
  'mask',
  'maskUnits',
  'maskContentUnits',
  'gradientUnits',
  'gradientTransform',
  'offset',
  'stop-color',
  'stop-opacity',
  'spreadMethod',
  'fx',
  'fy',
  'fr',
  'font-size',
  'font-family',
  'font-weight',
  'text-anchor',
  'dominant-baseline',
  'dx',
  'dy',
  'rotate',
  'preserveAspectRatio',
  'vector-effect',
];

export async function sanitizeSvg(source: string) {
  if (!source || Buffer.byteLength(source) > MAX_SVG_BYTES)
    throw new SvgValidationError('Choose an SVG up to 1 MB.');
  if (/<!DOCTYPE|<!ENTITY/i.test(source))
    throw new SvgValidationError('SVG document types and entities are not supported.');
  const { JSDOM } = await import('jsdom');
  let document: InstanceType<typeof JSDOM>;
  try {
    document = new JSDOM(source, { contentType: SVG_TYPE });
  } catch {
    throw new SvgValidationError('This SVG is not valid XML.');
  }
  try {
    const root = document.window.document.documentElement;
    if (root.localName !== 'svg' || root.namespaceURI !== namespace)
      throw new SvgValidationError('Choose a valid SVG document.');
    const stack = [{ node: root as Node, depth: 0 }];
    let count = 0;
    while (stack.length) {
      const item = stack.pop()!;
      if (++count > 10000 || item.depth > 64)
        throw new SvgValidationError('This SVG is too complex.');
      if (item.node.nodeType === 7)
        throw new SvgValidationError('SVG processing instructions are not supported.');
      for (const node of item.node.childNodes) stack.push({ node, depth: item.depth + 1 });
    }
    const purify = createDOMPurify(document.window);
    purify.addHook('uponSanitizeAttribute', (_node, data) => {
      if (['fill', 'stroke', 'clip-path', 'mask'].includes(data.attrName)) {
        if (
          data.attrValue.includes('\\') ||
          [...data.attrValue].some((character) => character.charCodeAt(0) < 32) ||
          (/url/i.test(data.attrValue) && !/^url\(\s*#[a-zA-Z_][\w.:-]*\s*\)$/.test(data.attrValue))
        )
          data.keepAttr = false;
      }
    });
    purify.sanitize(root, {
      IN_PLACE: true,
      NAMESPACE: namespace,
      ALLOWED_NAMESPACES: [namespace],
      ALLOWED_TAGS: tags,
      ALLOWED_ATTR: attributes,
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: false,
    });
    const number = (value: string | null) =>
      value && /^\d+(?:\.\d+)?(?:px)?$/.test(value.trim()) ? Number.parseFloat(value) : 0;
    const viewBox = root
      .getAttribute('viewBox')
      ?.trim()
      .split(/[\s,]+/)
      .map(Number);
    const width = number(root.getAttribute('width')) || (viewBox?.length === 4 ? viewBox[2] : 0);
    const height = number(root.getAttribute('height')) || (viewBox?.length === 4 ? viewBox[3] : 0);
    if (![width, height].every((value) => Number.isFinite(value) && value > 0 && value <= 16384))
      throw new SvgValidationError(
        'Give the SVG a width and height or a valid viewBox, up to 16384 pixels.',
      );
    const svg = root.outerHTML;
    if (Buffer.byteLength(svg) > MAX_SVG_BYTES)
      throw new SvgValidationError('The sanitised SVG exceeds 1 MB.');
    return { svg, width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
  } finally {
    document.window.close();
  }
}

type SvgDescriptor = { src: unknown; size: unknown; width: unknown; height: unknown };
export function svgReceipt(file: SvgDescriptor) {
  const secret = process.env.SEDNA_SECRET;
  if (!secret) throw new Error('SEDNA_SECRET is required for SVG uploads.');
  return createHmac('sha256', secret)
    .update(JSON.stringify([file.src, file.size, file.width, file.height]))
    .digest('base64url');
}
export function verifySvgReceipt(file: SvgDescriptor, receipt: unknown) {
  if (
    typeof receipt !== 'string' ||
    !/^[a-zA-Z0-9_-]{43}$/.test(receipt) ||
    !process.env.SEDNA_SECRET
  )
    return false;
  return timingSafeEqual(
    Buffer.from(receipt, 'base64url'),
    Buffer.from(svgReceipt(file), 'base64url'),
  );
}
