import { Completer } from '@jupyterlab/completer';
import { IStateDB } from '@jupyterlab/statedb';
import { Message } from '@lumino/messaging';

export const hideDocsKey = 'showDocs';
export let shouldHideDocs = false;
export let state: IStateDB;

/**
 * CompletionHandler's Completer property is readonly,
 * so while we can extend its protected methods,
 * "this" will still be bound to the base class.
 */
export class KiteCompleter extends Completer {
  constructor(options: Completer.IOptions, stateDB: IStateDB) {
    super(options);
    state = stateDB;
    state.fetch(hideDocsKey).then(value => {
      if (value) {
        console.log('[Kite] Stored Hide Docs State:', value);
        shouldHideDocs = value as boolean;
      }
    });
  }

  onUpdateRequest(msg: Message) {
    super.onUpdateRequest(msg);
    if (shouldHideDocs) {
      // Toggle classNames to correct state on subsequent updates.
      toggle(this.node, shouldHideDocs, state);
    }
  }

  handleEvent(event: Event): void {
    if (this.isHidden || !this.editor) {
      return;
    }
    if (event.type === 'keydown') {
      const keydownEvt = event as KeyboardEvent;
      // Shift + Tab
      if (keydownEvt.shiftKey && keydownEvt.keyCode === 9) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        shouldHideDocs = !shouldHideDocs;
        // Toggle docs immediately.
        toggle(this.node, shouldHideDocs, state);
        return;
      }
      // Since we replace the default handler if the completer is active,
      // handle enter keypresses here.
      if (keydownEvt.keyCode === 13) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        this.selectActive();
        return;
      }
    }
    super.handleEvent(event);
  }
}

export function toggle(
  node: HTMLElement,
  shouldHide: boolean,
  state?: IStateDB
) {
  const docpanels = node.querySelectorAll('.jp-Completer-docpanel');
  if (shouldHide) {
    docpanels.forEach(docpanel => {
      docpanel.classList.add('hidden');
    });
    state?.save(hideDocsKey, true);
  } else {
    docpanels.forEach(docpanel => {
      docpanel.classList.remove('hidden');
    });
    state?.remove(hideDocsKey);
  }
}
