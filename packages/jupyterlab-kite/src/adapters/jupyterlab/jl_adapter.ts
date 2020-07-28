import { JupyterFrontEnd } from '@jupyterlab/application';
import { CodeEditor } from '@jupyterlab/codeeditor';
import { CompletionHandler, ICompletionManager } from '@jupyterlab/completer';
import { Text } from '@jupyterlab/coreutils';
import { DocumentRegistry, IDocumentWidget } from '@jupyterlab/docregistry';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { IStateDB } from '@jupyterlab/statedb';
import { CodeJumper } from '@krassowski/jupyterlab_go_to_definition/lib/jumpers/jumper';
import { JSONObject } from '@lumino/coreutils';
import { Signal } from '@lumino/signaling';
import { Widget } from '@lumino/widgets';
import * as CodeMirror from 'codemirror';
import * as lsProtocol from 'vscode-languageserver-protocol';
import { ICommandContext } from '../../command_manager';
import { LSPConnection } from '../../connection';
import {
  DocumentConnectionManager,
  IDocumentConnectionData,
  ISocketConnectionOptions
} from '../../connection_manager';
import { PositionConverter } from '../../converter';
import { CompletionTriggerKind } from '../../lsp';
import { IEditorPosition, IRootPosition } from '../../positioning';
import { IForeignContext, VirtualDocument } from '../../virtual/document';
import { VirtualEditor } from '../../virtual/editor';
import { CodeMirrorAdapter } from '../codemirror/cm_adapter';
import { ILSPFeature, ILSPFeatureConstructor } from '../codemirror/feature';
import { Completion } from '../codemirror/features/completion';
import { Selection } from '../codemirror/features/selection';
import { KiteConnector } from './components/completion';
import { FreeTooltip } from './components/free_tooltip';
import { KiteCompleter } from './kite_completer';
import { KiteModel } from './kite_model';

export const lsp_features: Array<ILSPFeatureConstructor> = [
  Completion,
  Selection
];

export interface IJupyterLabComponentsManager {
  invoke_completer: (kind: CompletionTriggerKind) => void;
  cancel_completer: () => void;
  create_tooltip: (
    markup: lsProtocol.MarkupContent,
    cm_editor: CodeMirror.Editor,
    position: IEditorPosition
  ) => FreeTooltip;
  remove_tooltip: () => void;
  jumper: CodeJumper;
  dispose(): void;
  isDisposed: boolean;
}

export class StatusMessage {
  /**
   * The text message to be shown on the statusbar
   */
  message: string;
  changed: Signal<StatusMessage, string>;

  constructor() {
    this.message = '';
    this.changed = new Signal(this);
  }

  /**
   * Set the text message and (optionally) the timeout to remove it.
   * @param message
   * @param timeout - number of ms to until the message is cleaned;
   *        -1 if the message should stay up indefinitely
   */
  set(message: string, timeout?: number) {
    this.message = message;
    this.changed.emit('');
    if (timeout == null && timeout !== -1) {
      setTimeout(this.cleanup, timeout);
    }
  }

  cleanup = () => {
    this.message = '';
    this.changed.emit('');
  };
}

/**
 * The values should follow the https://microsoft.github.io/language-server-protocol/specification guidelines
 */
const mime_type_language_map: JSONObject = {
  'text/x-rsrc': 'r',
  'text/x-r-source': 'r',
  // currently there are no LSP servers for IPython we are aware of
  'text/x-ipython': 'python'
};

/**
 * Foreign code: low level adapter is not aware of the presence of foreign languages;
 * it operates on the virtual document and must not attempt to infer the language dependencies
 * as this would make the logic of inspections caching impossible to maintain, thus the WidgetAdapter
 * has to handle that, keeping multiple connections and multiple virtual documents.
 */
export abstract class JupyterLabWidgetAdapter
  implements IJupyterLabComponentsManager {
  jumper: CodeJumper;
  state: IStateDB;
  protected adapters: Map<VirtualDocument.id_path, CodeMirrorAdapter>;
  private readonly invoke_command: string;
  protected document_connected: Signal<
    JupyterLabWidgetAdapter,
    IDocumentConnectionData
  >;
  protected abstract current_completion_connector: KiteConnector;
  private _tooltip: FreeTooltip;
  public connection_manager: DocumentConnectionManager;
  public status_message: StatusMessage;
  public isDisposed = false;

  completion_handler?: CompletionHandler;

  protected constructor(
    protected app: JupyterFrontEnd,
    protected widget: IDocumentWidget,
    protected rendermime_registry: IRenderMimeRegistry,
    invoke: string,
    connection_manager: DocumentConnectionManager,
    state: IStateDB
  ) {
    this.document_connected = new Signal(this);
    this.invoke_command = invoke;
    this.adapters = new Map();
    this.status_message = new StatusMessage();
    this.connection_manager = connection_manager;
    this.state = state;

    // set up signal connections
    this.widget.context.saveState.connect(this.on_save_state, this);
    this.connection_manager.closed.connect(this.on_connection_closed, this);
    this.document_connected.connect(this.connect_completion, this);
    this.widget.disposed.connect(this.dispose, this);
  }

  on_connection_closed(
    manager: DocumentConnectionManager,
    { virtual_document }: IDocumentConnectionData
  ) {
    console.log(
      'LSP: connection closed, disconnecting adapter',
      virtual_document.id_path
    );
    if (virtual_document !== this.virtual_editor?.virtual_document) {
      return;
    }
    this.dispose();
  }

  dispose() {
    if (this.isDisposed) {
      return;
    }
    if (this.virtual_editor?.virtual_document) {
      this.disconnect_adapter(this.virtual_editor?.virtual_document);
    }

    this.widget.context.saveState.disconnect(this.on_save_state, this);
    this.connection_manager.closed.disconnect(this.on_connection_closed, this);
    this.document_connected.disconnect(this.connect_completion, this);
    this.widget.disposed.disconnect(this.dispose, this);
    this.widget.context.model.contentChanged.disconnect(
      this.update_documents,
      this
    );
    for (let adapter of this.adapters.values()) {
      adapter.dispose();
    }
    this.adapters.clear();

    this.connection_manager.disconnect_document_signals(
      this.virtual_editor.virtual_document
    );
    this.virtual_editor.dispose();

    this.current_completion_connector?.dispose();

    // just to be sure
    delete this.virtual_editor;
    delete this.app;
    delete this.widget;
    delete this._tooltip;
    delete this.connection_manager;
    delete this.current_completion_connector;
    delete this.rendermime_registry;
    delete this.widget;

    // actually disposed
    this.isDisposed = true;
  }

  abstract virtual_editor: VirtualEditor;
  abstract get document_path(): string;
  abstract get mime_type(): string;
  protected abstract connect_completion(): void;

  get widget_id(): string {
    return this.widget.id;
  }

  get language(): string {
    // the values should follow https://microsoft.github.io/language-server-protocol/specification guidelines
    if (mime_type_language_map.hasOwnProperty(this.mime_type)) {
      return mime_type_language_map[this.mime_type] as string;
    } else {
      let without_parameters = this.mime_type.split(';')[0];
      let [type, subtype] = without_parameters.split('/');
      if (type === 'application' || type === 'text') {
        if (subtype.startsWith('x-')) {
          return subtype.substr(2);
        } else {
          return subtype;
        }
      } else {
        return this.mime_type;
      }
    }
  }

  abstract get language_file_extension(): string;

  // equivalent to triggering didClose and didOpen, as per syncing specification,
  // but also reloads the connection; used during file rename (or when it was moved)
  protected reload_connection() {
    // ignore premature calls (before the editor was initialized)
    if (this.virtual_editor == null) {
      return;
    }

    // disconnect all existing connections (and dispose adapters)
    this.connection_manager.unregister_document(
      this.virtual_editor.virtual_document
    );

    // recreate virtual document using current path and language
    this.virtual_editor.create_virtual_document();
    // reconnect
    this.connect_document(this.virtual_editor.virtual_document, true).catch(
      console.warn
    );
  }

  protected on_save_state(context: any, state: DocumentRegistry.SaveState) {
    // ignore premature calls (before the editor was initialized)
    if (this.virtual_editor == null) {
      return;
    }

    if (state === 'completed') {
      for (let connection of this.connection_manager.connections.values()) {
        connection.sendSaved(
          this.virtual_editor.virtual_document.document_info
        );
      }
    }
  }

  abstract find_ce_editor(cm_editor: CodeMirror.Editor): CodeEditor.IEditor;

  cancel_completer(): void {
    this.current_completion_connector?.abort();
  }

  async invoke_completer(kind: CompletionTriggerKind) {
    if (this.completion_handler) {
      const editor = this.completion_handler.editor;
      let model: KiteModel;
      try {
        model = this.completion_handler.completer.model as KiteModel;
      } catch (e) {
        console.log('Could not cast model into KiteModel', e);
        return;
      }

      if (model.original) {
        // Core would bail, so we force fetch completions here.
        // Construct request
        // https://github.com/jupyterlab/jupyterlab/blob/1df0e18951194bb5ec230e76441e8108e0b472e7/packages/completer/src/handler.ts#L349
        const position = editor.getCursorPosition();
        const text = editor.model.value.text;
        const offset = Text.jsIndexToCharIndex(
          editor.getOffsetAt(position),
          text
        );
        const request: CompletionHandler.IRequest = { text, offset };

        // track the model state as of the request
        const state = model.state;

        const reply = await this.current_completion_connector.with_trigger_kind(
          kind,
          () => {
            return this.current_completion_connector.fetch(request);
          }
        );
        if (model.setCompletionItems && reply) {
          model.update(reply, state);
          return;
        }
      }
    }
    this.current_completion_connector.with_trigger_kind(kind, () => {
      return this.app.commands.execute(this.invoke_command);
    });
  }

  protected async on_connected(data: IDocumentConnectionData) {
    let { virtual_document } = data;

    await this.connect_adapter(data.virtual_document, data.connection);
    this.document_connected.emit(data);

    await this.virtual_editor.update_documents().then(() => {
      // refresh the document on the LSP server
      this.document_changed(virtual_document, virtual_document, true);

      console.log(
        'LSP: virtual document(s) for',
        this.document_path,
        'have been initialized'
      );
    });
  }

  /**
   * Opens a connection for the document. The connection may or may
   * not be initialized, yet, and depending on when this is called, the client
   * may not be fully connected.
   *
   * @param virtual_document a VirtualDocument
   * @param send_open whether to open the document immediately
   */
  protected async connect_document(
    virtual_document: VirtualDocument,
    send_open = false
  ): Promise<void> {
    virtual_document.changed.connect(this.document_changed, this);

    virtual_document.foreign_document_opened.connect(
      this.on_foreign_document_opened,
      this
    );

    const connection_context = await this.connect(virtual_document).catch(
      console.warn
    );

    if (!send_open) {
      return;
    }

    if (connection_context && connection_context.connection) {
      connection_context.connection.sendOpenWhenReady(
        virtual_document.document_info
      );
    } else {
      console.warn(`Connection for ${virtual_document.path} was not opened`);
    }
  }

  /**
   * Handler for opening a document contained in a parent document. The assumption
   * is that the editor already exists for this, and as such the document
   * should be queued for immediate opening.
   *
   * @param host the VirtualDocument that contains the VirtualDocument in another language
   * @param context information about the foreign VirtualDocument
   */
  protected async on_foreign_document_opened(
    host: VirtualDocument,
    context: IForeignContext
  ) {
    const { foreign_document } = context;

    await this.connect_document(foreign_document, true);

    foreign_document.foreign_document_closed.connect(
      this.on_foreign_document_closed,
      this
    );
  }

  on_foreign_document_closed(host: VirtualDocument, context: IForeignContext) {
    const { foreign_document } = context;
    foreign_document.foreign_document_closed.disconnect(
      this.on_foreign_document_closed,
      this
    );
    foreign_document.foreign_document_opened.disconnect(
      this.on_foreign_document_opened,
      this
    );
    foreign_document.changed.disconnect(this.document_changed, this);
  }

  document_changed(
    virtual_document: VirtualDocument,
    document: VirtualDocument,
    is_init = false
  ) {
    // TODO only send the difference, using connection.sendSelectiveChange()
    let connection = this.connection_manager.connections.get(
      virtual_document.id_path
    );
    let adapter = this.adapters.get(virtual_document.id_path);

    if (!connection?.isReady) {
      console.log('LSP: Skipping document update signal: connection not ready');
      return;
    }
    if (adapter == null) {
      console.log('LSP: Skipping document update signal: adapter not ready');
      return;
    }

    // super hack: we need to cancel completions synchronously in order to avoid a race
    // where we return completions after an edit but before cancellation, resulting in stale completions appearing.
    // If we delegate this to updateAfterChange, it'll happen asynchronously, so we do it here.
    this.cancel_completer();

    // console.log(
    //   'LSP: virtual document',
    //   virtual_document.id_path,
    //   'has changed sending update'
    // );
    connection.sendFullTextChange(
      virtual_document.value,
      virtual_document.document_info
    );
    // the first change (initial) is not propagated to features,
    // as it has no associated CodeMirrorChange object
    if (!is_init) {
      // guarantee that the virtual editor won't perform an update of the virtual documents while
      // the changes are recorded...
      // TODO this is not ideal - why it solves the problem of some errors,
      //  it introduces an unnecessary delay. A better way could be to invalidate some of the updates when a new one comes in.
      //  but maybe not every one (then the outdated state could be kept for too long fo a user who writes very quickly)
      //  also we would not want to invalidate the updates for the purpose of autocompletion (the trigger characters)
      this.virtual_editor
        .with_update_lock(async () => {
          await adapter.updateAfterChange();
        })
        .then()
        .catch(console.warn);
    }
  }

  private async connect_adapter(
    virtual_document: VirtualDocument,
    connection: LSPConnection
  ) {
    let adapter = this.create_adapter(virtual_document, connection);
    this.adapters.set(virtual_document.id_path, adapter);
  }

  private disconnect_adapter(virtual_document: VirtualDocument) {
    let adapter = this.adapters.get(virtual_document.id_path);
    this.adapters.delete(virtual_document.id_path);
    if (adapter != null) {
      adapter.dispose();
    }
  }

  public get_features(virtual_document: VirtualDocument) {
    let adapter = this.adapters.get(virtual_document.id_path);
    return adapter?.features;
  }

  private async connect(virtual_document: VirtualDocument) {
    let language = virtual_document.language;

    console.log(`LSP: will connect using language: ${language}`);

    let options: ISocketConnectionOptions = {
      virtual_document,
      language,
      document_path: this.document_path
    };

    let connection = await this.connection_manager.connect(options);

    await this.on_connected({ virtual_document, connection });

    return {
      connection,
      virtual_document
    };
  }

  /**
   * Connect the change signal in order to update all virtual documents after a change.
   *
   * Update to the state of a notebook may be done without a notice on the CodeMirror level,
   * e.g. when a cell is deleted. Therefore a JupyterLab-specific signals are watched instead.
   *
   * While by not using the change event of CodeMirror editors we loose an easy way to send selective,
   * (range) updates this can be still implemented by comparison of before/after states of the
   * virtual documents, which is even more resilient and -obviously - editor-independent.
   */
  connect_contentChanged_signal() {
    this.widget.context.model.contentChanged.connect(
      this.update_documents,
      this
    );
  }

  create_adapter(
    virtual_document: VirtualDocument,
    connection: LSPConnection
  ): CodeMirrorAdapter {
    let adapter_features = new Array<ILSPFeature>();
    for (let feature_type of lsp_features) {
      let feature = new feature_type(
        this.virtual_editor,
        virtual_document,
        connection,
        this,
        this.status_message
      );
      adapter_features.push(feature);
    }

    let adapter = new CodeMirrorAdapter(
      this.virtual_editor,
      virtual_document,
      this,
      adapter_features
    );
    console.log('LSP: Adapter for', this.document_path, 'is ready.');
    // the client is now fully ready: signal to the server that the document is "open"
    connection.sendOpenWhenReady(virtual_document.document_info);
    return adapter;
  }

  update_documents(_slot: any) {
    // update the virtual documents (sending the updates to LSP is out of scope here)
    this.virtual_editor
      .update_documents()
      .then()
      .catch(console.warn);
  }

  get_position_from_context_menu(): IRootPosition {
    // Note: could also try using this.app.contextMenu.menu.contentNode position.
    // Note: could add a guard on this.app.contextMenu.menu.isAttached

    // get the first node as it gives the most accurate approximation
    let leaf_node = this.app.contextMenuHitTest(() => true);

    let { left, top } = leaf_node.getBoundingClientRect();

    // @ts-ignore
    let event = this.app._contextMenuEvent;

    // if possible, use more accurate position from the actual event
    // (but this relies on an undocumented and unstable feature)
    if (event !== undefined) {
      left = event.clientX;
      top = event.clientY;
      event.stopPropagation();
    }

    return this.virtual_editor.coordsChar(
      {
        left: left,
        top: top
      },
      'window'
    ) as IRootPosition;
  }

  get_context(root_position: IRootPosition): ICommandContext {
    let document = this.virtual_editor.document_at_root_position(root_position);
    let virtual_position = this.virtual_editor.root_position_to_virtual_position(
      root_position
    );
    return {
      document,
      connection: this.connection_manager.connections.get(document.id_path),
      virtual_position,
      root_position,
      features: this.get_features(document),
      editor: this.virtual_editor,
      app: this.app,
      adapter: this
    };
  }

  get_context_from_context_menu(): ICommandContext {
    let root_position = this.get_position_from_context_menu();
    return this.get_context(root_position);
  }

  public create_tooltip(
    markup: lsProtocol.MarkupContent,
    cm_editor: CodeMirror.Editor,
    position: IEditorPosition
  ): FreeTooltip {
    this.remove_tooltip();
    const bundle =
      markup.kind === 'plaintext'
        ? { 'text/plain': markup.value }
        : { 'text/markdown': markup.value };
    const tooltip = new FreeTooltip({
      anchor: this.widget.content,
      bundle: bundle,
      editor: this.find_ce_editor(cm_editor),
      rendermime: this.rendermime_registry,
      position: PositionConverter.cm_to_ce(position),
      moveToLineEnd: false
    });
    Widget.attach(tooltip, document.body);
    this._tooltip = tooltip;
    return tooltip;
  }

  remove_tooltip() {
    if (this._tooltip !== undefined) {
      this._tooltip.dispose();
    }
  }

  registerKiteModules(
    handler: ICompletionManager.ICompletableAttributes,
    editor: CodeEditor.IEditor,
    state: IStateDB
  ) {
    if (handler instanceof CompletionHandler) {
      this.completion_handler = handler;
      const kiteModel = new KiteModel();
      this.completion_handler.completer.model = kiteModel;

      const kiteCompleter = new KiteCompleter(
        {
          editor: editor,
          model: kiteModel
        },
        state
      );
      try {
        const jlCompleter = this.completion_handler.completer as KiteCompleter;
        jlCompleter.onUpdateRequest = kiteCompleter.onUpdateRequest;
      } catch (err) {
        console.error(err);
      }
    }
  }
}
