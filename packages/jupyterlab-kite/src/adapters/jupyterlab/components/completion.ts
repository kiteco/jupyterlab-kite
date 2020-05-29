import { DataConnector } from '@jupyterlab/statedb';
import { CompletionHandler, KernelConnector } from '@jupyterlab/completer';
import { CodeEditor } from '@jupyterlab/codeeditor';
import { CodeMirrorEditor } from '@jupyterlab/codemirror';

import { JSONArray, JSONObject } from '@lumino/coreutils';

import { CompletionItem, MarkupContent } from 'vscode-languageserver-types';

import { completionItemKindNames, CompletionTriggerKind } from '../../../lsp';
import { PositionConverter } from '../../../converter';
import { VirtualDocument } from '../../../virtual/document';
import { VirtualEditor } from '../../../virtual/editor';
import {
  IEditorPosition,
  IRootPosition,
  IVirtualPosition
} from '../../../positioning';
import { LSPConnection } from '../../../connection';
import { Session } from '@jupyterlab/services';
import { LabIcon } from '@jupyterlab/ui-components';

import kiteLogo from '../../../../style/icons/kite-logo.svg';

export class KiteConnector extends DataConnector<
  CompletionHandler.ICompletionItemsReply,
  void,
  CompletionHandler.IRequest
> {
  isDisposed = false;
  private _editor: CodeEditor.IEditor;
  private _kernel_connector: KernelConnector;
  private _connections: Map<VirtualDocument.id_path, LSPConnection>;
  protected options: KiteConnector.IOptions;

  virtual_editor: VirtualEditor;
  responseType = CompletionHandler.ICompletionItemsResponseType;
  private _trigger_kind: CompletionTriggerKind;
  private suppress_auto_invoke_in = ['comment'];
  private icon: LabIcon;

  /**
   * Create a new Kite connector for completion requests.
   *
   * @param options - The instantiation options for the Kite connector.
   */
  constructor(options: KiteConnector.IOptions) {
    super();
    this._editor = options.editor;
    this._connections = options.connections;
    this.virtual_editor = options.virtual_editor;
    this.options = options;

    if (options.session) {
      this._kernel_connector = new KernelConnector({
        session: options.session
      });
    }

    this.icon = new LabIcon({
      name: 'jupyterlab-kite:completion-icon',
      svgstr: kiteLogo
    });
    this.icon.bindprops({ className: 'kite-logo' });
  }

  dispose() {
    if (this.isDisposed) {
      return;
    }
    delete this._connections;
    delete this._kernel_connector;
    delete this.virtual_editor;
    delete this.options;
    delete this._editor;
    delete this.icon;
    delete this.isDisposed;
  }

  /**
   * Fetch completion requests.
   *
   * @param request - The completion request text and details.
   */
  async fetch(
    request?: CompletionHandler.IRequest
  ): Promise<CompletionHandler.ICompletionItemsReply | undefined> {
    let editor = this._editor;

    const cursor = editor.getCursorPosition();
    const token = editor.getTokenForPosition(cursor);

    if (token.type && this.suppress_auto_invoke_in.indexOf(token.type) !== -1) {
      console.log(
        '[Kite][Completer] Suppressing completer auto-invoke in',
        token.type
      );
      return;
    }

    const start = editor.getPositionAt(token.offset);
    const end = editor.getPositionAt(token.offset + token.value.length);

    if (!start || !end) {
      console.log('[Kite][Completer] No start or end position found');
      return;
    }

    let position_in_token = cursor.column - start.column - 1;
    const typed_character = token.value[cursor.column - start.column - 1];

    let start_in_root = this.transform_from_editor_to_root(start);
    let end_in_root = this.transform_from_editor_to_root(end);
    let cursor_in_root = this.transform_from_editor_to_root(cursor);

    let virtual_editor = this.virtual_editor;

    // find document for position
    let document = virtual_editor.document_at_root_position(start_in_root);

    let virtual_start = virtual_editor.root_position_to_virtual_position(
      start_in_root
    );
    let virtual_end = virtual_editor.root_position_to_virtual_position(
      end_in_root
    );
    let virtual_cursor = virtual_editor.root_position_to_virtual_position(
      cursor_in_root
    );

    if (!this._kernel_connector || !request) {
      return this.fetch_kite(
        token,
        typed_character,
        virtual_start,
        virtual_end,
        virtual_cursor,
        document,
        position_in_token
      );
    }

    const kitePromise = this.fetch_kite(
      token,
      typed_character,
      virtual_start,
      virtual_end,
      virtual_cursor,
      document,
      position_in_token
    ).catch(_ => {
      return {
        start: -1,
        end: -1,
        items: []
      } as CompletionHandler.ICompletionItemsReply;
    });
    const kernelPromise = this._kernel_connector.fetch(request).catch(_ => {
      return {
        start: -1,
        end: -1,
        matches: [],
        metadata: {}
      } as CompletionHandler.IReply;
    });

    const [kernel, kite] = await Promise.all([kernelPromise, kitePromise]);
    return this.merge_replies(kernel, kite);
  }

  async fetch_kite(
    token: CodeEditor.IToken,
    typed_character: string,
    start: IVirtualPosition,
    end: IVirtualPosition,
    cursor: IVirtualPosition,
    document: VirtualDocument,
    position_in_token: number
  ): Promise<CompletionHandler.ICompletionItemsReply | undefined> {
    let connection = this._connections.get(document.id_path);

    if (!connection) {
      console.log('[Kite][Completer] No LSP Connection found');
      return;
    }

    console.log('[Kite][Completer] Fetching');
    let lspCompletionItems = ((await connection.getCompletion(
      cursor,
      {
        start,
        end,
        text: token.value
      },
      document.document_info,
      false,
      typed_character,
      this.trigger_kind
    )) || []) as CompletionItem[];

    let prefix = token.value.slice(0, position_in_token + 1);
    let all_non_prefixed = true;
    let items: CompletionHandler.ICompletionItem[] = [];
    lspCompletionItems.forEach(match => {
      let completionItem = {
        label: match.label,
        insertText: match.insertText,
        type: match.kind ? completionItemKindNames[match.kind] : '',
        icon: this.icon,
        documentation: MarkupContent.is(match.documentation)
          ? match.documentation.value
          : match.documentation,
        filterText: match.filterText,
        deprecated: match.deprecated
      };

      // Update prefix values
      let text = match.insertText ? match.insertText : match.label;
      if (text.toLowerCase().startsWith(prefix.toLowerCase())) {
        all_non_prefixed = false;
        if (prefix !== token.value) {
          if (text.toLowerCase().startsWith(token.value.toLowerCase())) {
            // given a completion insert text "display_table" and two test cases:
            // disp<tab>data →  display_table<cursor>data
            // disp<tab>lay  →  display_table<cursor>
            // we have to adjust the prefix for the latter (otherwise we would get display_table<cursor>lay),
            // as we are constrained NOT to replace after the prefix (which would be "disp" otherwise)
            prefix = token.value;
          }
        }
      }

      items.push(completionItem);
    });

    return {
      // note in the ContextCompleter it was:
      // start: token.offset,
      // end: token.offset + token.value.length,
      // which does not work with "from statistics import <tab>" as the last token ends at "t" of "import",
      // so the completer would append "mean" as "from statistics importmean" (without space!);
      // (in such a case the typedCharacters is undefined as we are out of range)
      // a different workaround would be to prepend the token.value prefix:
      // text = token.value + text;
      // but it did not work for "from statistics <tab>" and lead to "from statisticsimport" (no space)
      start: token.offset + (all_non_prefixed ? 1 : 0),
      end: token.offset + prefix.length,
      items
    };
  }

  private merge_replies(
    kernelReply: CompletionHandler.IReply,
    kiteReply: CompletionHandler.ICompletionItemsReply
  ): CompletionHandler.ICompletionItemsReply {
    const newKernelReply = this.transform(kernelReply);

    if (!newKernelReply.items.length) {
      console.log('[Kite]: No kernel items, returning Kite reply');
      return kiteReply;
    }
    if (!kiteReply.items.length) {
      console.log('[Kite]: No Kite items, returning kernel reply');
      return newKernelReply;
    }

    // Dedupe Kernel labels with Kite insertTexts
    const kiteSet = new Set(kiteReply.items.map(item => item.insertText));
    newKernelReply.items = newKernelReply.items.filter(
      item => !kiteSet.has(item.label)
    );

    console.log('[Kite]: Merging', newKernelReply, kiteReply);
    return {
      ...kiteReply,
      items: kiteReply.items.concat(newKernelReply.items)
    };
  }

  /**
   * Converts an IReply into an ICompletionItemsReply.
   */
  private transform(
    reply: CompletionHandler.IReply
  ): CompletionHandler.ICompletionItemsReply {
    const items = new Array<CompletionHandler.ICompletionItem>();
    const metadata = reply.metadata || {};
    const types = metadata._jupyter_types_experimental as JSONArray;

    if (types) {
      types.forEach((item: JSONObject) => {
        const text = item.text as string;
        const type = item.type as string;
        if (type !== '<unknown>') {
          items.push({ label: text, type });
        }
      });
    } else {
      const matches = reply.matches;
      matches.forEach(match => {
        items.push({ label: match });
      });
    }
    return { start: reply.start, end: reply.end, items };
  }

  transform_from_editor_to_root(position: CodeEditor.IPosition): IRootPosition {
    let cm_editor = (this._editor as CodeMirrorEditor).editor;
    let cm_start = PositionConverter.ce_to_cm(position) as IEditorPosition;
    return this.virtual_editor.transform_editor_to_root(cm_editor, cm_start);
  }

  get trigger_kind(): CompletionTriggerKind {
    return this._trigger_kind;
  }

  set trigger_kind(kind: CompletionTriggerKind) {
    this._trigger_kind = kind;
  }

  with_trigger_kind(kind: CompletionTriggerKind, fn: Function) {
    try {
      this.trigger_kind = kind;
      return fn();
    } finally {
      // Return to the default state
      this.trigger_kind = CompletionTriggerKind.Invoked;
    }
  }
}

/**
 * A namespace for Kite connector statics.
 */
export namespace KiteConnector {
  /**
   * The instantiation options for cell completion handlers.
   */
  export interface IOptions {
    /**
     * The editor used by the LSP connector.
     */
    editor: CodeEditor.IEditor;
    virtual_editor: VirtualEditor;
    /**
     * The connections to be used by the LSP connector.
     */
    connections: Map<VirtualDocument.id_path, LSPConnection>;

    session?: Session.ISessionConnection;
  }
}
