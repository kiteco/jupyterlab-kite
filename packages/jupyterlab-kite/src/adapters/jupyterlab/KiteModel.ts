import { Completer, CompleterModel } from '@jupyterlab/completer';

export class KiteModel extends CompleterModel {
  private _state: Completer.ITextState | undefined;

  constructor() {
    super();
  }

  get state(): Completer.ITextState | undefined {
    return this._state;
  }

  set state(newState: Completer.ITextState) {
    this._state = newState;
  }

  handleCursorChange(change: Completer.ITextState) {
    super.handleCursorChange(change);
    const prevState = this.state;
    if (prevState) {
      /**
       * Reset model unless cursor change is result of typing a new character.
       */
      if (
        change.column - prevState.column === 1 ||
        (change.line - prevState.line === 1 && change.column === 1)
      ) {
        return;
      }
      this.reset(true);
    }
  }

  handleTextChange(change: Completer.ITextState) {
    super.handleTextChange(change);
    this.state = change;
  }
}
