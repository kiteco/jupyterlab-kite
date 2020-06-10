import { Completer } from '@jupyterlab/completer';

export class KiteCompleter extends Completer {
  handleEvent(event: Event): void {
    if (this.isHidden || !this.editor) {
      return;
    }
    if (event.type === 'keydown') {
      const keydownEvt = event as KeyboardEvent;
      if (keydownEvt.shiftKey && keydownEvt.keyCode === 9) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        console.log('Success!');
        return;
      }
    }
    super.handleEvent(event);
  }
}
