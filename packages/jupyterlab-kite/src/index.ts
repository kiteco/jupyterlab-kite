import {
  ILabShell,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { ICommandPalette } from '@jupyterlab/apputils';
import { CodeMirrorEditor } from '@jupyterlab/codemirror';
import { ICompletionManager } from '@jupyterlab/completer';
import { IDocumentManager } from '@jupyterlab/docmanager';
import {
  DocumentRegistry,
  IDocumentWidget
} from '@jupyterlab/docregistry/lib/registry';
import { FileEditor, IEditorTracker } from '@jupyterlab/fileeditor';
import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { IStateDB } from '@jupyterlab/statedb';
import { IStatusBar } from '@jupyterlab/statusbar';
import { FileEditorJumper } from '@krassowski/jupyterlab_go_to_definition/lib/jumpers/fileeditor';
import { NotebookJumper } from '@krassowski/jupyterlab_go_to_definition/lib/jumpers/notebook';
import '../style/index.css';
import { KiteStatus } from './adapters/jupyterlab/components/statusbar';
import { KiteStatusModel } from './adapters/jupyterlab/components/status_model';
import { FileEditorAdapter } from './adapters/jupyterlab/file_editor';
import { NotebookAdapter } from './adapters/jupyterlab/notebook';
import { file_editor_adapters, notebook_adapters } from './command_manager';
import { DocumentConnectionManager } from './connection_manager';
import { registerKiteCommands } from './kite_commands';
import { KiteOnboarding } from './kite_onboarding';
import { KiteAccessible } from './kite_accessible';
import { LanguageServerManager } from './manager';

import IPaths = JupyterFrontEnd.IPaths;

/**
 * The plugin registration information.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: '@kiteco/jupyterlab-kite:plugin',
  requires: [
    IEditorTracker,
    INotebookTracker,
    ISettingRegistry,
    ICommandPalette,
    IDocumentManager,
    ICompletionManager,
    IRenderMimeRegistry,
    IPaths,
    ILabShell,
    IStatusBar,
    IStateDB
  ],
  activate: async (
    app: JupyterFrontEnd,
    fileEditorTracker: IEditorTracker,
    notebookTracker: INotebookTracker,
    settingRegistry: ISettingRegistry,
    palette: ICommandPalette,
    documentManager: IDocumentManager,
    completion_manager: ICompletionManager,
    rendermime_registry: IRenderMimeRegistry,
    paths: IPaths,
    labShell: ILabShell,
    status_bar: IStatusBar,
    state: IStateDB
  ) => {
    registerKiteCommands(app, palette);

    const language_server_manager = new LanguageServerManager({});
    const kite_status_model = new KiteStatusModel(language_server_manager);
    const connection_manager = new DocumentConnectionManager({
      language_server_manager,
      kite_status_model
    });
    const ka = await KiteAccessible.CreateAsync(
      app.serviceManager,
      settingRegistry,
      connection_manager,
      language_server_manager
    );
    ka.checkHealth();
    const onboarding_manager = new KiteOnboarding(
      app,
      palette,
      documentManager,
      state,
      connection_manager
    );
    const status_bar_item = new KiteStatus(kite_status_model);

    labShell.currentChanged.connect(() => {
      const current = labShell.currentWidget;
      if (!current) {
        return;
      }
      let adapter = null;
      if (notebookTracker.has(current)) {
        let id = (current as NotebookPanel).id;
        adapter = notebook_adapters.get(id);
      } else if (fileEditorTracker.has(current)) {
        let id = (current as IDocumentWidget<FileEditor>).content.id;
        adapter = file_editor_adapters.get(id);
      }

      if (adapter != null) {
        status_bar_item.model.adapter = adapter;
      }
      onboarding_manager.showOnBoot();
    });

    status_bar.registerStatusItem(
      '@kiteco/jupyterlab-kite:language-server-status',
      {
        item: status_bar_item,
        align: 'left',
        rank: 1,
        isActive: () =>
          !!(
            labShell.currentWidget &&
            (fileEditorTracker.currentWidget ||
              notebookTracker.currentWidget) &&
            (labShell.currentWidget === fileEditorTracker.currentWidget ||
              labShell.currentWidget === notebookTracker.currentWidget)
          )
      }
    );

    fileEditorTracker.widgetUpdated.connect((_sender, _widget) => {
      console.log(_sender);
      console.log(_widget);
    });

    const connect_file_editor = (
      widget: IDocumentWidget<FileEditor, DocumentRegistry.IModel>
    ) => {
      let fileEditor = widget.content;

      if (fileEditor.editor instanceof CodeMirrorEditor) {
        let jumper = new FileEditorJumper(widget, documentManager);
        let adapter = new FileEditorAdapter(
          widget,
          jumper,
          app,
          completion_manager,
          rendermime_registry,
          connection_manager,
          state
        );
        file_editor_adapters.set(fileEditor.id, adapter);

        const disconnect = () => {
          file_editor_adapters.delete(fileEditor.id);
          widget.disposed.disconnect(disconnect);
          widget.context.pathChanged.disconnect(reconnect);
          adapter.dispose();
        };

        const reconnect = () => {
          disconnect();
          connect_file_editor(widget);
        };

        widget.disposed.connect(disconnect);
        widget.context.pathChanged.connect(reconnect);
      }
    };

    fileEditorTracker.widgetAdded.connect((sender, widget) => {
      connect_file_editor(widget);
    });

    const connect_notebook = (widget: NotebookPanel) => {
      // NOTE: assuming that the default cells content factory produces CodeMirror editors(!)
      let jumper = new NotebookJumper(widget, documentManager);
      let adapter = new NotebookAdapter(
        widget,
        jumper,
        app,
        completion_manager,
        rendermime_registry,
        connection_manager,
        state
      );
      notebook_adapters.set(widget.id, adapter);

      const disconnect = () => {
        notebook_adapters.delete(widget.id);
        widget.disposed.disconnect(disconnect);
        widget.context.pathChanged.disconnect(reconnect);
        adapter.dispose();
      };

      const reconnect = () => {
        disconnect();
        connect_notebook(widget);
      };

      widget.context.pathChanged.connect(reconnect);
      widget.disposed.connect(disconnect);
    };

    notebookTracker.widgetAdded.connect(async (sender, widget) => {
      connect_notebook(widget);
    });
  },
  autoStart: true
};

/**
 * Export the plugin as default.
 */
export default plugin;
