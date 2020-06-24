import { JupyterFrontEnd } from '@jupyterlab/application';
import { ICommandPalette } from '@jupyterlab/apputils';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { IStateDB } from '@jupyterlab/statedb';
import { DocumentConnectionManager } from './connection_manager';
import { category, cmdIds, IKiteCommand } from './kite_commands';
import { VirtualDocument } from './virtual/document';

import IPaths = JupyterFrontEnd.IPaths;

export class KiteOnboarding {
  app: JupyterFrontEnd;
  palette: ICommandPalette;
  documentManager: IDocumentManager;
  paths: IPaths;
  state: IStateDB;
  connectionManager: DocumentConnectionManager;
  file: string;

  constructor(
    app: JupyterFrontEnd,
    palette: ICommandPalette,
    documentManager: IDocumentManager,
    paths: IPaths,
    state: IStateDB,
    connectionManager: DocumentConnectionManager
  ) {
    this.app = app;
    this.palette = palette;
    this.documentManager = documentManager;
    this.paths = paths;
    this.state = state;
    this.connectionManager = connectionManager;

    this.registerCommand();
  }

  registerCommand() {
    const cmd: IKiteCommand = {
      id: cmdIds.tutorial,
      options: {
        label: 'Kite: Tutorial',
        execute: () => {
          this._show();
        }
      }
    };
    this.app.commands.addCommand(cmd.id, cmd.options);
    this.palette.addItem({ command: cmd.id, category });
  }

  async _fetch(): Promise<string> {
    // Enable connection even without open document
    const emptyVirtualDocument = new VirtualDocument(
      'python',
      '',
      {},
      {},
      false,
      '.py',
      false
    );
    const options = {
      virtual_document: emptyVirtualDocument,
      language: 'python',
      document_path: ''
    };
    const connection = await this.connectionManager.connect(options);
    if (connection) {
      return connection.fetchKiteOnboarding(this.paths.directories.serverRoot);
    } else {
      return '';
    }
  }

  private async _show() {
    const filename = await this._fetch();
    if (filename) {
      this.documentManager.openOrReveal(filename);
    }
  }
}
