import { VDomModel } from '@jupyterlab/apputils';
import { PageConfig, URLExt } from '@jupyterlab/coreutils';
import { ServerConnection } from '@jupyterlab/services';
import { LabIcon } from '@jupyterlab/ui-components';

import { JupyterLabWidgetAdapter } from '../jl_adapter';
import { LSPConnection } from '../../../connection';
import { DocumentConnectionManager } from '../../../connection_manager';
import { ILanguageServerManager } from '../../../tokens';
import { VirtualDocument } from '../../../virtual/document';

import kiteLogo from '../../../../style/icons/kite-logo.svg';

export interface IKiteStatus {
  status: string;
  short: string;
  long: string;
}
/**
 * A VDomModel for the LSP of current file editor/notebook.
 */
export class KiteStatusModel extends VDomModel {
  private _connection_manager: DocumentConnectionManager;
  private _icon: LabIcon = new LabIcon({
    name: 'jupyterlab-kite:status-icon',
    svgstr: kiteLogo
  });
  private _kiteStatus: IKiteStatus = { status: '', short: '', long: '' };

  constructor() {
    super();

    this.icon.bindprops({ className: 'kite-logo' });
  }

  async fetchKiteInstalled(): Promise<void> {
    const response = await ServerConnection.makeRequest(
      this.kiteInstalledUrl,
      { method: 'GET' },
      ServerConnection.makeSettings()
    );
    if (!response.ok) {
      console.warn('Could not fetch Kite Install status:', response.statusText);
    }

    let installed: boolean;
    try {
      installed = await response.json();
      if (!installed && this.status.status !== 'not installed') {
        this.status = {
          status: 'not installed',
          short: 'not installed',
          long: 'Kite install could not be found.'
        };
      } else if (installed && this.status.status === 'not installed') {
        this.reset();
      }
    } catch (err) {
      console.warn(err);
    }
  }

  get kiteInstalledUrl(): string {
    return URLExt.join(
      PageConfig.getBaseUrl(),
      ILanguageServerManager.URL_NS,
      'kite_installed'
    );
  }

  get status(): IKiteStatus {
    return this._kiteStatus;
  }

  set status(status: IKiteStatus) {
    this._kiteStatus = status;
    this.stateChanged.emit(void 0);
  }

  get icon(): LabIcon {
    return this._icon;
  }

  get short_message(): string {
    if (!this.adapter || !this.status.status) {
      return 'Kite: not running';
    }
    return 'Kite: ' + this.status.short;
  }

  get long_message(): string {
    if (!this.adapter || !this.status.status) {
      return 'Kite is not reachable.';
    }
    return this.status.long;
  }

  get adapter(): JupyterLabWidgetAdapter | null {
    return this._adapter;
  }

  set adapter(adapter: JupyterLabWidgetAdapter | null) {
    if (this._adapter != null) {
      this._adapter.status_message.changed.connect(this._onChange);
    }

    if (adapter != null) {
      adapter.status_message.changed.connect(this._onChange);
    }

    this._adapter = adapter;
  }

  get connection_manager() {
    return this._connection_manager;
  }

  set connection_manager(connection_manager) {
    if (this._connection_manager != null) {
      this._connection_manager.connected.disconnect(this._onChange);
      this._connection_manager.initialized.connect(this._onChange);
      this._connection_manager.disconnected.disconnect(this._onChange);
      this._connection_manager.closed.disconnect(this._onChange);
      this._connection_manager.documents_changed.disconnect(this._onChange);
    }

    if (connection_manager != null) {
      connection_manager.connected.connect(this._onChange);
      connection_manager.initialized.connect(this._onChange);
      connection_manager.disconnected.connect(this._onChange);
      connection_manager.closed.connect(this._onChange);
      connection_manager.documents_changed.connect(this._onChange);
    }

    this._connection_manager = connection_manager;
  }

  get activeDocument(): VirtualDocument | undefined {
    if (this.adapter && this.adapter.virtual_editor) {
      return this.adapter.virtual_editor.virtual_document;
    }
    return undefined;
  }

  get activeConnection(): LSPConnection | undefined {
    if (this.activeDocument) {
      return this.connection_manager.connections.get(
        this.activeDocument.id_path
      );
    }
    return undefined;
  }

  reset() {
    this.status = { status: '', short: '', long: '' };
  }

  private _onChange = () => {
    this.stateChanged.emit(void 0);
  };

  private _adapter: JupyterLabWidgetAdapter | null = null;
}
