import { Completer } from '@jupyterlab/completer';
import { IStateDB } from '@jupyterlab/statedb';
import { Message } from '@lumino/messaging';

export const hideDocsKey = 'hideDocs';
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
    const docpanel: Element | null = this.node.querySelector(
      '.jp-Completer-docpanel'
    );
    if (shouldHideDocs) {
      docpanel?.classList.add('hidden');
    } else {
      docpanel?.classList.remove('hidden');
    }
  }
}

export function toggle() {
  shouldHideDocs = !shouldHideDocs;
  state.save(hideDocsKey, shouldHideDocs);
}
