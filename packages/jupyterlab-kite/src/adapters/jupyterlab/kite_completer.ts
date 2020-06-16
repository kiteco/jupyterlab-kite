import { Completer } from '@jupyterlab/completer';
import { Message } from '@lumino/messaging';

/**
 * CompletionHandler's Completer property is readonly,
 * so while we can extend its protected methods,
 * "this" will still be bound to the base class.
 */
export class KiteCompleter extends Completer {
  private static SHOULD_SHOW_DOCS = true;

  onUpdateRequest(msg: Message) {
    super.onUpdateRequest(msg);
    if (!KiteCompleter.SHOULD_SHOW_DOCS) {
      // Toggle classNames to correct state on subsequent updates.
      toggle(this.node, KiteCompleter.SHOULD_SHOW_DOCS);
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
        KiteCompleter.SHOULD_SHOW_DOCS = !KiteCompleter.SHOULD_SHOW_DOCS;
        // Toggle docs immediately.
        toggle(this.node, KiteCompleter.SHOULD_SHOW_DOCS);
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

export function toggle(node: HTMLElement, shouldShow: boolean) {
  const docpanels = node.querySelectorAll('.jp-Completer-docpanel');
  if (shouldShow) {
    docpanels.forEach(docpanel => {
      docpanel.classList.remove('hidden');
    });
  } else {
    docpanels.forEach(docpanel => {
      docpanel.classList.add('hidden');
    });
  }
}
