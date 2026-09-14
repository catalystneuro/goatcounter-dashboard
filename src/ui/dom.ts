// A tiny element helper. All text goes through textContent, never innerHTML.

type Child = Node | string | number | null | undefined | false | Child[];

type Props = {
  class?: string;
  id?: string;
  title?: string;
  href?: string;
  target?: string;
  rel?: string;
  type?: string;
  value?: string;
  placeholder?: string;
  name?: string;
  for?: string;
  role?: string;
  tabindex?: string | number;
  disabled?: boolean;
  checked?: boolean;
  autocomplete?: string;
  spellcheck?: string;
  required?: boolean;
  min?: string;
  max?: string;
  hidden?: boolean;
  style?: string;
  dataset?: Record<string, string>;
  aria?: Record<string, string>;
  onClick?: (e: MouseEvent) => void;
  onInput?: (e: Event) => void;
  onChange?: (e: Event) => void;
  onSubmit?: (e: SubmitEvent) => void;
  onKeydown?: (e: KeyboardEvent) => void;
};

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    switch (k) {
      case 'class':
        el.className = String(v);
        break;
      case 'dataset':
        for (const [dk, dv] of Object.entries(v as Record<string, string>)) el.dataset[dk] = dv;
        break;
      case 'aria':
        for (const [ak, av] of Object.entries(v as Record<string, string>)) el.setAttribute(`aria-${ak}`, av);
        break;
      case 'onClick':
        el.addEventListener('click', v as EventListener);
        break;
      case 'onInput':
        el.addEventListener('input', v as EventListener);
        break;
      case 'onChange':
        el.addEventListener('change', v as EventListener);
        break;
      case 'onSubmit':
        el.addEventListener('submit', v as EventListener);
        break;
      case 'onKeydown':
        el.addEventListener('keydown', v as EventListener);
        break;
      case 'disabled':
      case 'checked':
      case 'required':
      case 'hidden':
        (el as unknown as Record<string, unknown>)[k] = v;
        break;
      case 'value':
        (el as unknown as { value: string }).value = String(v);
        break;
      default:
        el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(parent: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(parent, c);
    else if (c instanceof Node) parent.appendChild(c);
    else parent.appendChild(document.createTextNode(String(c)));
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, ...children: (SVGElement | string)[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of children) {
    if (typeof c === 'string') el.appendChild(document.createTextNode(c));
    else el.appendChild(c);
  }
  return el;
}
