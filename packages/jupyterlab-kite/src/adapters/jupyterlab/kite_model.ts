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
    this.state = change;
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
    if (this.isStale()) {
      this.reset(true);
      return;
    }

    this.query = query;
    this.cursor = {
      start: Text.charIndexToJsIndex(reply.start, state.text),
      end: Text.charIndexToJsIndex(reply.end, state.text)
    };
    this.setCompletionItems(reply.items);
  }

  setCompletionItems(items: CompletionHandler.ICompletionItems) {
    if (this.isStale()) {
      this.reset(true);
      return
    }
    super.setCompletionItems(items);
  }

  private isStale(): boolean {
    if (this.original.text !== this.state.text || this.original.line !== this.state.line || this.original.column !== this.state.column) {
      return true
    }
    return false;
  }
}
