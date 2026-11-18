/**
 * The developer-panel tabs of the V3 kernel (docs/V3/nodes/N0-foundation.md): a system adds a tab of its own to
 * the developer's panel (devPanel.ts) without the panel knowing the system. The panel shows its eight built-in
 * tabs as it always did and, in a second row under them, the registered ones by `order`.
 *
 * A tab's `build` is called the first time the tab is shown and is handed a `DevPane`: the tab's own element
 * and a few helpers that make the same pieces the built-in tabs are made of (devPanes.ts: a scrolling body,
 * headings, notes, rows of buttons, a status box, a line for messages), so a new tab looks like the others.
 * Anything with a `data-tip` attribute gets the panel's help bubble. A tab that needs more builds its own
 * elements into `body`.
 *
 * The registry itself touches no DOM (it is filled before the panel exists, and in Node tests); only `devPane`
 * does, when the panel calls it.
 */

/** one button of a row */
export interface DevButton {
  label: string;
  /** what it does, for the help bubble (HTML) */
  tip?: string;
  /** the one that does the main thing: drawn in the accent colour */
  go?: boolean;
  click(button: HTMLButtonElement): void;
}

/** what a tab's builder is handed */
export interface DevPane {
  /** the tab's own element (a column: the scrolling body, then whatever is appended under it) */
  readonly el: HTMLElement;
  /** the scrolling body the helpers below append to */
  readonly body: HTMLElement;
  heading(text: string): HTMLElement;
  /** a line or two of small print */
  note(text: string): HTMLElement;
  /** a row of buttons (2 or 3: in that many equal columns) */
  buttons(list: readonly DevButton[], columns?: 2 | 3): HTMLElement;
  /** a box for a few lines kept up to date (where one is, what is selected) */
  box(text?: string): HTMLElement;
  /** a line for what just happened; the function returned writes it (bad: in the warning colour) */
  message(): (text: string, bad?: boolean) => void;
}

export interface DevTab {
  /** unique among the tabs: lower-case letters, digits, '_' and '-'; not one of the built-in ones */
  readonly id: string;
  /** on the tab itself (short: a word) */
  readonly title: string;
  /** among the registered tabs the lower comes first (default 100; ties by id) */
  readonly order?: number;
  /** beside the panel's title while the tab shows */
  readonly sub?: string;
  /** the lines under the title while the tab shows (HTML); absent: how to move about with the panel open */
  readonly hint?: string;
  /** the first time the tab is shown */
  build(pane: DevPane): void;
  /** a few times a second while the tab shows: bring its live bits up to date */
  tick?(): void;
}

/** the panel's own tabs (devPanel.ts TABS): their ids are taken */
export const BUILT_IN_DEV_TABS: readonly string[] = ['parts', 'lab', 'proving', 'place', 'weather', 'time', 'look', 'terrain'];

const ID = /^[a-z][a-z0-9_-]*$/;

export class DevTabs {
  private readonly tabs = new Map<string, DevTab>();
  private readonly watchers: ((tab: DevTab) => void)[] = [];

  /** register a tab (a second one with the same id, or a built-in id, throws); returns the function that takes it out */
  add(tab: DevTab): () => void {
    if (typeof tab.id !== 'string' || !ID.test(tab.id)) throw new Error(`a developer tab's id must be lower-case letters, digits, _ and - beginning with a letter, not '${String(tab.id)}'`);
    if (BUILT_IN_DEV_TABS.includes(tab.id)) throw new Error(`'${tab.id}' is one of the developer panel's own tabs`);
    if (this.tabs.has(tab.id)) throw new Error(`a developer tab with the id '${tab.id}' is already registered`);
    this.tabs.set(tab.id, tab);
    for (const w of [...this.watchers]) w(tab);
    return () => {
      if (this.tabs.get(tab.id) === tab) this.tabs.delete(tab.id);
    };
  }

  get(id: string): DevTab | undefined {
    return this.tabs.get(id);
  }

  get size(): number {
    return this.tabs.size;
  }

  /** the registered tabs in the order they are shown: by `order`, then by id */
  list(): DevTab[] {
    return [...this.tabs.values()].sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  /** hear of every tab added from now on (the panel, once it is open, shows a late one too) */
  onAdd(fn: (tab: DevTab) => void): () => void {
    this.watchers.push(fn);
    return () => {
      const i = this.watchers.indexOf(fn);
      if (i >= 0) this.watchers.splice(i, 1);
    };
  }
}

/** the helpers for a tab's element, making the pieces the panel's own tabs are made of (the classes of devPanes.ts) */
export function devPane(el: HTMLElement): DevPane {
  const body = document.createElement('div');
  body.className = 'body';
  el.appendChild(body);
  const add = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    body.appendChild(e);
    return e;
  };
  return {
    el,
    body,
    heading: (text) => add('h5', '', text),
    note: (text) => add('div', 'note', text),
    buttons: (list, columns) => {
      const row = add('div', columns === 2 ? 'btns two' : columns === 3 ? 'btns three' : 'btns');
      for (const b of list) {
        const btn = document.createElement('button');
        btn.textContent = b.label;
        if (b.go) btn.className = 'go';
        if (b.tip) btn.dataset.tip = b.tip;
        btn.addEventListener('click', () => b.click(btn));
        row.appendChild(btn);
      }
      return row;
    },
    box: (text = '') => add('div', 'where', text),
    message: () => {
      const msg = add('div', 'msg');
      return (text, bad = false) => {
        msg.textContent = text;
        msg.classList.toggle('bad', bad);
      };
    },
  };
}
