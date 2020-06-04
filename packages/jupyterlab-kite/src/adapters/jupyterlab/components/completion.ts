import { DataConnector } from '@jupyterlab/statedb';
import { CompletionHandler, KernelConnector } from '@jupyterlab/completer';
import { CodeEditor } from '@jupyterlab/codeeditor';
import { CodeMirrorEditor } from '@jupyterlab/codemirror';
import { Session } from '@jupyterlab/services';
import { LabIcon } from '@jupyterlab/ui-components';

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

import kiteLogo from '../../../../style/icons/kite-logo.svg';

interface KiteCompletionItem extends CompletionItem {
  hint: string;
}

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
  private _trigger_kind: CompletionTriggerKind = CompletionTriggerKind.Invoked;
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

    const isManual = this._trigger_kind === CompletionTriggerKind.Invoked;
    // Don't auto fetch kernel completions if token.type is string
    const suppress_string = !isManual && token.type === 'string';
    /**
     * Don't fetch kernel completions if:
     * - No kernel connector
     * - No request object
     * - Token type is string (otherwise kernel completions appear within docstrings)
     */
    if (!this._kernel_connector || !request || suppress_string) {
      return this.fetch_kite(
        token,
        typed_character,
        virtual_start,
        virtual_end,
        virtual_cursor,
        document,
        position_in_token
      ).catch(() => {
        return KiteConnector.EmptyICompletionItemsReply;
      });
    }

    const kitePromise = () => {
      return this.fetch_kite(
        token,
        typed_character,
        virtual_start,
        virtual_end,
        virtual_cursor,
        document,
        position_in_token
      ).catch(() => {
        return KiteConnector.EmptyICompletionItemsReply;
      });
    };

    const kernelPromise = () => {
      return this._kernel_connector.fetch(request).catch(() => {
        return KiteConnector.EmptyIReply;
      });
    };

    const timeout = new Promise<CompletionHandler.IReply>(resolve => {
      setTimeout(resolve, 100, KiteConnector.EmptyIReply);
    });
    const kernelTimeoutPromise = () => {
      return Promise.race([timeout, kernelPromise()]).then(reply => {
        return reply;
      });
    };

    const [kernel, kite] = await Promise.all([
      isManual ? kernelPromise() : kernelTimeoutPromise(),
      kitePromise()
    ]);
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
  ): Promise<CompletionHandler.ICompletionItemsReply> {
    let connection = this._connections.get(document.id_path);

    if (!connection) {
      console.log('[Kite][Completer] No LSP Connection found');
      return KiteConnector.EmptyICompletionItemsReply;
    }

    console.log('[Kite][Completer] Fetching');
    const lspCompletionItems = await connection
      .getCompletion(
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
      )
      .catch(err => console.error(err));

    let prefix = token.value.slice(0, position_in_token + 1);
    let all_non_prefixed = true;
    let items: CompletionHandler.ICompletionItem[] = [];
    (lspCompletionItems as KiteCompletionItem[]).forEach(match => {
      let completionItem = {
        label: match.label,
        insertText: match.insertText,
        type: match.hint
          ? match.hint
          : match.kind
          ? completionItemKindNames[match.kind]
          : '',
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
      return kiteReply;
    }
    if (!kiteReply.items.length) {
      return newKernelReply;
    }

    // Dedupe Kite and Kernel items based on label
    const kiteSet = new Set(kiteReply.items.map(item => item.label));
    newKernelReply.items = newKernelReply.items.filter(
      item => !kiteSet.has(item.label)
    );

    console.log('[Kite]: Merging', kiteReply, newKernelReply);
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
        items.push({ label: text, type: type === '<unknown>' ? '' : type });
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

  export const EmptyICompletionItemsReply = {
    start: -1,
    end: -1,
    items: [] as CompletionHandler.ICompletionItems
  };

  export const EmptyIReply = {
    start: -1,
    end: -1,
    matches: [] as ReadonlyArray<string>,
    metadata: {}
  };
}
