import { Completer, CompletionHandler } from '@jupyterlab/completer';

import { Text } from '@jupyterlab/coreutils';
import { ISignal, Signal } from '@lumino/signaling';
import { JSONExt, ReadonlyPartialJSONArray } from '@lumino/coreutils';
import {
  IIterator,
  iter,
  IterableOrArrayLike,
  map,
  StringExt,
  toArray
} from '@lumino/algorithm';
import { KiteConnector } from './components/completion';

export class KiteModel {
  /**
   * ========== Private fields we've added ==========
   */
  private _state: Completer.ITextState | undefined;

  /**
   * ========== Private fields from CompleterModel ==========
   */
  private _current: Completer.ITextState | null = null;
  private _cursor: Completer.ICursorSpan | null = null;
  private _isDisposed = false;
  private _completionItems: KiteConnector.IKiteCompletionItems = [];
  private _options: string[] = [];
  private _original: Completer.ITextState | null = null;
  private _query = '';
  private _subsetMatch = false;
  private _typeMap: Completer.TypeMap = {};
  private _orderedTypes: string[] = [];
  private _stateChanged = new Signal<this, void>(this);

  /**
   * ========== Getters/Setters ==========
   */

  /**
   * The current text change details.
   */
  get current(): Completer.ITextState | null {
    return this._current;
  }
  set current(newValue: Completer.ITextState | null) {
    const unchanged =
      this._current === newValue ||
      (this._current && newValue && JSONExt.deepEqual(newValue, this._current));

    if (unchanged) {
      return;
    }

    const original = this._original;

    // Original request must always be set before a text change. If it isn't
    // the model fails silently.
    if (!original) {
      return;
    }

    const cursor = this._cursor;

    // Cursor must always be set before a text change. This happens
    // automatically in the completer handler, but since `current` is a public
    // attribute, this defensive check is necessary.
    if (!cursor) {
      return;
    }

    const current = (this._current = newValue);

    if (!current) {
      this._stateChanged.emit(undefined);
      return;
    }

    const originalLine = original.text.split('\n')[original.line];
    const currentLine = current.text.split('\n')[current.line];

    // If the text change means that the original start point has been preceded,
    // then the completion is no longer valid and should be reset.
    if (!this._subsetMatch && currentLine.length < originalLine.length) {
      this.reset(true);
      return;
    }

    const { start, end } = cursor;
    // Clip the front of the current line.
    let query = current.text.substring(start);
    // Clip the back of the current line by calculating the end of the original.
    const ending = original.text.substring(end);
    query = query.substring(0, query.lastIndexOf(ending));
    this._query = query;
    this._stateChanged.emit(undefined);
  }

  /**
   * The cursor details that the API has used to return matching options.
   */
  get cursor(): Completer.ICursorSpan | null {
    return this._cursor;
  }
  set cursor(newValue: Completer.ICursorSpan | null) {
    // Original request must always be set before a cursor change. If it isn't
    // the model fails silently.
    if (!this.original) {
      return;
    }
    this._cursor = newValue;
  }

  /**
   * Get whether the model is disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * The original completion request details.
   */
  get original(): Completer.ITextState | null {
    return this._original;
  }
  set original(newValue: Completer.ITextState | null) {
    const unchanged =
      this._original === newValue ||
      (this._original &&
        newValue &&
        JSONExt.deepEqual(newValue, this._original));
    if (unchanged) {
      return;
    }

    this._resetKite();

    // Set both the current and original to the same value when original is set.
    this._current = this._original = newValue;

    this._stateChanged.emit(undefined);
  }

  /**
   * The query against which items are filtered.
   */
  get query(): string {
    return this._query;
  }
  set query(newValue: string) {
    this._query = newValue;
  }

  get state(): Completer.ITextState | undefined {
    return this._state;
  }

  set state(newState: Completer.ITextState | undefined) {
    this._state = newState;
  }

  /**
   * A signal emitted when state of the completer menu changes.
   */
  get stateChanged(): ISignal<this, void> {
    return this._stateChanged;
  }

  /**
   * A flag that is true when the model value was modified by a subset match.
   */
  get subsetMatch(): boolean {
    return this._subsetMatch;
  }
  set subsetMatch(newValue: boolean) {
    this._subsetMatch = newValue;
  }

  /**
   * ========== Public Methods ==========
   */

  /**
   * The list of visible items in the completer menu.
   *
   * #### Notes
   * This is a read-only property.
   */
  completionItems?(): CompletionHandler.ICompletionItems {
    let query = this._query;
    if (query) {
      return this._markup(query);
    }
    return this._completionItems;
  }

  /**
   * Create a resolved patch between the original state and a patch string.
   *
   * @param patch - The patch string to apply to the original value.
   *
   * @returns A patched text change or undefined if original value did not exist.
   */
  createPatch(patch: string): Completer.IPatch | undefined {
    const original = this._original;
    const cursor = this._cursor;
    const current = this._current;

    if (!original || !cursor || !current) {
      return undefined;
    }

    let { start, end } = cursor;
    // Also include any filtering/additional-typing that has occurred
    // since the completion request in the patched length.
    end = end + (current.text.length - original.text.length);

    return { start, end, value: patch };
  }

  /**
   * Dispose of the resources held by the model.
   */
  dispose(): void {
    // Do nothing if already disposed.
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    Signal.clearData(this);
  }

  /**
   * Handle a cursor change.
   */
  handleCursorChange(change: Completer.ITextState): void {
    const prevState = this.state;
    this.state = change;

    // super.handleCursorChange
    (() => {
      // If there is no active completion, return.
      if (!this._original) {
        return;
      }

      const { column, line } = change;
      const { current, original } = this;

      if (!original) {
        return;
      }

      // If a cursor change results in a the cursor being on a different line
      // than the original request, cancel.
      if (line !== original.line) {
        this.reset(true);
        return;
      }

      // If a cursor change results in the cursor being set to a position that
      // precedes the original column, cancel.
      if (column < original.column) {
        this.reset(true);
        return;
      }

      const { cursor } = this;

      if (!cursor || !current) {
        return;
      }

      // If a cursor change results in the cursor being set to a position beyond
      // the end of the area that would be affected by completion, cancel.
      const cursorDelta = cursor.end - cursor.start;
      const originalLine = original.text.split('\n')[original.line];
      const currentLine = current.text.split('\n')[current.line];
      const inputDelta = currentLine.length - originalLine.length;

      if (column > original.column + cursorDelta + inputDelta) {
        this.reset(true);
        return;
      }
    })();

    // Check if we've left the bounds of the replacement range.
    // The check in CompleterModel.handleCursorChange is not quite right.
    // Here, we use createPatch to correctly check the replacement range.
    const patch = this.createPatch('');
    // Compute the current cursor position from change as a global text offset.
    const changeCh =
      change.column +
      change.line +
      change.text
        .split('\n')
        .slice(0, change.line)
        .map(s => s.length)
        .reduce((x, y) => x + y, 0);
    if (patch && (changeCh < patch.start || changeCh > patch.end)) {
      this._resetKite();
      return;
    }

    // Reset if more than one character may have been inserted.
    // This is not quite the best spot for this check, but it works.
    if (prevState) {
      if (
        change.column - prevState.column === 1 &&
        change.line - prevState.line === 0
      ) {
        // single char insertion: don't reset
        return;
      }
      if (change.column === 1 && change.line - prevState.line === 1) {
        // newline insertion: don't reset
        return;
      }
      // otherwise reset the model
      this.reset(true);
    }
  }

  /**
   * Handle a text change.
   */
  handleTextChange(change: Completer.ITextState): void {
    this.state = change;
    const original = this._original;

    // If there is no active completion, return.
    if (!original) {
      return;
    }

    const { text, column, line } = change;
    const last = text.split('\n')[line][column - 1];

    // If last character entered is not whitespace or if the change column is
    // greater than or equal to the original column, update completion.
    if ((last && last.match(/\S/)) || change.column >= original.column) {
      this.current = change;
      return;
    }

    // If final character is whitespace, reset completion.
    this.reset(false);
  }

  /**
   * The list of visible items in the completer menu.
   *
   * #### Notes
   * This is a read-only property.
   */
  items(): IIterator<Completer.IItem> {
    return this._filter();
  }

  /**
   * The unfiltered list of all available options in a completer menu.
   */
  options(): IIterator<string> {
    return iter(this._options);
  }

  /**
   * An ordered list of all the known types in the typeMap.
   *
   * #### Notes
   * To visually encode the types of the completer matches, we assemble an
   * ordered list. This list begins with:
   * ```
   * ['function', 'instance', 'class', 'module', 'keyword']
   * ```
   * and then has any remaining types listed alphebetically. This will give
   * reliable visual encoding for these known types, but allow kernels to
   * provide new types.
   */
  orderedTypes(): string[] {
    return this._orderedTypes;
  }

  /**
   * Reset the state of the model and emit a state change signal.
   *
   * @param hard - Reset even if a subset match is in progress.
   */
  reset(hard = false) {
    // When the completer detects a common subset prefix for all options,
    // it updates the model and sets the model source to that value, triggering
    // a reset. Unless explicitly a hard reset, this should be ignored.
    if (!hard && this._subsetMatch) {
      return;
    }
    this._reset();
    this._stateChanged.emit(undefined);
  }

  /**
   * Set the list of visible items in the completer menu, and append any
   * new types to KNOWN_TYPES.
   */
  setCompletionItems(newValue: CompletionHandler.ICompletionItems): void {
    if (this.isStale()) {
      this._resetKite();
      return;
    }
    if (
      JSONExt.deepEqual(
        (newValue as unknown) as ReadonlyPartialJSONArray,
        (this._completionItems as unknown) as ReadonlyPartialJSONArray
      )
    ) {
      return;
    }
    const query = this.query;
    const newSet = new Set(newValue.map(item => item.label));
    const retainableItems = this._completionItems.filter(item => {
      // Don't retain if it's a noFilter completion
      if (item.noFilter) {
        return false;
      }
      // Dedupe with new completions
      if (newSet.has(item.label)) {
        return false;
      }
      // Check if completion still matches the updated query
      return item.label.toLowerCase().startsWith(query.toLowerCase());
    });
    newValue = newValue.concat(retainableItems);
    this._completionItems = newValue;
    this._orderedTypes = Private.findOrderedCompletionItemTypes(
      this._completionItems
    );
    this._stateChanged.emit(undefined);
  }

  /**
   * Set the available options in the completer menu.
   */
  setOptions(
    newValue: IterableOrArrayLike<string>,
    typeMap?: Completer.TypeMap
  ) {
    const values = toArray(newValue || []);
    const types = typeMap || {};

    if (
      JSONExt.deepEqual(values, this._options) &&
      JSONExt.deepEqual(types, this._typeMap)
    ) {
      return;
    }
    if (values.length) {
      this._options = values;
      this._typeMap = types;
      this._orderedTypes = Private.findOrderedTypes(types);
    } else {
      this._options = [];
      this._typeMap = {};
      this._orderedTypes = [];
    }
    this._stateChanged.emit(undefined);
  }

  /**
   * The map from identifiers (a.b) to types (function, module, class, instance,
   * etc.).
   *
   * #### Notes
   * A type map is currently only provided by the latest IPython kernel using
   * the completer reply metadata field `_jupyter_types_experimental`. The
   * values are completely up to the kernel.
   *
   */
  typeMap(): Completer.TypeMap {
    return this._typeMap;
  }

  /**
   * Re-implementation of private method _updateModel.
   * https://github.com/jupyterlab/jupyterlab/blob/1df0e18951194bb5ec230e76441e8108e0b472e7/packages/completer/src/handler.ts#L421
   * Enables completer to fully update model state when completions are force updated in JupyterLabWidgetAdapter.
   */
  update(
    reply: CompletionHandler.ICompletionItemsReply,
    state: Completer.ITextState
  ) {
    if (this.isStale(state)) {
      this._resetKite();
      return;
    }
    this._original = state;
    if (reply.start !== -1) {
      const newCursor = {
        start: Text.charIndexToJsIndex(reply.start, state.text),
        end: Text.charIndexToJsIndex(reply.end, state.text)
      };
      // Calculate the query based on the text under the cursor
      this.query = state.text.slice(newCursor.start, newCursor.end);
      this.cursor = newCursor;
    }
    this.setCompletionItems(reply.items);
  }

  /**
   * ========== Private Methods ==========
   */

  /**
   * Apply the query to the complete options list to return the matching subset.
   */
  private _filter(): IIterator<Completer.IItem> {
    const options = this._options || [];
    const query = this._query;
    if (!query) {
      return map(options, option => ({ raw: option, text: option }));
    }
    const results: Completer.IItem[] = [];
    for (const option of options) {
      if (option.toLowerCase().startsWith(query.toLowerCase())) {
        const marked = StringExt.highlight(
          option,
          [...Array(query.length).keys()],
          Private.mark
        );
        results.push({
          raw: option,
          text: marked.join('')
        });
      }
    }
    return iter(results);
  }

  /**
   * Check if CompletionItem matches against query.
   * Highlight matching prefix by adding <mark> tags.
   */
  private _markup(query: string): CompletionHandler.ICompletionItems {
    const items = this._completionItems;
    let results: CompletionHandler.ICompletionItem[] = [];
    for (let item of items) {
      // See if label matches query string
      // Filter non-matching items.
      if (
        item.noFilter ||
        item.label.toLowerCase().startsWith(query.toLowerCase())
      ) {
        let matchIndices =
          StringExt.findIndices(
            item.label.toLowerCase(),
            query.toLowerCase()
          ) || [];
        // Highlight label text if there's a match
        let marked = StringExt.highlight(
          item.label,
          matchIndices,
          Private.mark
        );
        results.push({
          label: marked.join(''),
          // If no insertText is present, preserve original label value
          // by setting it as the insertText.
          insertText: item.insertText ? item.insertText : item.label,
          type: item.type,
          icon: item.icon,
          documentation: item.documentation,
          deprecated: item.deprecated
        });
      }
    }
    return results;
  }

  /**
   * Reset the state of the model.
   */
  private _reset(): void {
    this._current = null;
    this._cursor = null;
    this._completionItems = [];
    this._options = [];
    this._original = null;
    this._query = '';
    this._subsetMatch = false;
    this._typeMap = {};
    this._orderedTypes = [];
  }

  /**
   * Removes all noFilter completions, and then resets if there are no completions left.
   */
  private _resetKite(): void {
    this._completionItems = this._completionItems.filter(item => {
      return !item.noFilter;
    });
    if (this._completionItems.length === 0) {
      this._reset();
    }
    this._stateChanged.emit(undefined);
  }

  private isStale(check: Completer.ITextState = this._original): boolean {
    return (
      check.text !== this.state.text ||
      check.line !== this.state.line ||
      check.column !== this.state.column
    );
  }
}

/**
 * A namespace for completer model private data.
 */
namespace Private {
  /**
   * The list of known type annotations of completer matches.
   */
  const KNOWN_TYPES = ['function', 'instance', 'class', 'module', 'keyword'];

  /**
   * The map of known type annotations of completer matches.
   */
  const KNOWN_MAP = KNOWN_TYPES.reduce((acc, type) => {
    acc[type] = null;
    return acc;
  }, {} as Completer.TypeMap);

  /**
   * Mark a highlighted chunk of text.
   */
  export function mark(value: string): string {
    return `<mark>${value}</mark>`;
  }

  /**
   * Compute a reliably ordered list of types for ICompletionItems.
   *
   * #### Notes
   * The resulting list always begins with the known types:
   * ```
   * ['function', 'instance', 'class', 'module', 'keyword']
   * ```
   * followed by other types in alphabetical order.
   *
   */
  export function findOrderedCompletionItemTypes(
    items: CompletionHandler.ICompletionItems
  ): string[] {
    const newTypeSet = new Set<string>();
    items.forEach(item => {
      if (
        item.type &&
        !KNOWN_TYPES.includes(item.type) &&
        !newTypeSet.has(item.type!)
      ) {
        newTypeSet.add(item.type!);
      }
    });
    const newTypes = Array.from(newTypeSet);
    newTypes.sort((a, b) => a.localeCompare(b));
    return KNOWN_TYPES.concat(newTypes);
  }

  /**
   * Compute a reliably ordered list of types.
   *
   * #### Notes
   * The resulting list always begins with the known types:
   * ```
   * ['function', 'instance', 'class', 'module', 'keyword']
   * ```
   * followed by other types in alphabetical order.
   */
  export function findOrderedTypes(typeMap: Completer.TypeMap): string[] {
    const filtered = Object.keys(typeMap)
      .map(key => typeMap[key])
      .filter(
        (value: string | null): value is string =>
          !!value && !(value in KNOWN_MAP)
      )
      .sort((a, b) => a.localeCompare(b));

    return KNOWN_TYPES.concat(filtered);
  }
}
