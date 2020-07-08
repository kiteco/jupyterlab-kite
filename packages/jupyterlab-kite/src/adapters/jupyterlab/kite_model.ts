import {
  Completer,
  CompleterModel,
  CompletionHandler
} from '@jupyterlab/completer';

import { Text } from '@jupyterlab/coreutils';

export class KiteModel extends CompleterModel {
  private _state: Completer.ITextState | undefined;

  constructor() {
    super();
  }

  get state(): Completer.ITextState | undefined {
    return this._state;
  }

  set state(newState: Completer.ITextState | undefined) {
    this._state = newState;
  }

  handleCursorChange(change: Completer.ITextState) {
    super.handleCursorChange(change);
    const prevState = this.state;
    if (prevState) {
      if (change.column - prevState.column === 1 && change.line - prevState.line === 0) {
        // single char insertion
        return;
      }
      if (change.column === 1 && change.line - prevState.line === 1) {
        // newline insertion
        return
      }
      // otherwise reset the model
      this.reset(true);
    }
  }

  handleTextChange(change: Completer.ITextState) {
    super.handleTextChange(change);
    this.state = change;
  }

  /**
   * Re-implementation of private method _updateModel.
   * https://github.com/jupyterlab/jupyterlab/blob/1df0e18951194bb5ec230e76441e8108e0b472e7/packages/completer/src/handler.ts#L421
   * Enables completer to fully update model state when completions are force updated in JupyterLabWidgetAdapter.
   */
  update(reply: CompletionHandler.ICompletionItemsReply, query: string, state: Completer.ITextState) {
    this.original = state;
    this.query = query;
    const text = state.text;
    // Update the cursor.
    this.cursor = {
      start: Text.charIndexToJsIndex(reply.start, text),
      end: Text.charIndexToJsIndex(reply.end, text)
    };
  }
}
