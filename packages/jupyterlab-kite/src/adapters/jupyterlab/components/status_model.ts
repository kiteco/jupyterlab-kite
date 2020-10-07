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
  private _kiteStatus: IKiteStatus | null = null;
  private _installed = true;
  private _disconnected = false;
  private _serverextensionReachable = false;

  constructor() {
    super();

    this.icon.bindprops({ className: 'kite-logo' });
  }

  async fetchKiteInstalled(): Promise<void> {
    if (this._disconnected) {
      return;
    }

    const response = await ServerConnection.makeRequest(
      this.kiteInstalledUrl,
      { method: 'GET' },
      ServerConnection.makeSettings()
    );
    if (!response.ok) {
      console.warn('Could not fetch Kite Install status:', response.statusText);
    } else {
      if (!this._serverextensionReachable) {
        this._serverextensionReachable = true;
        this._onChange();
      }
    }

    if (response.status === 404) {
      this._serverextensionReachable = false;
      this._onChange();
      return;
    }

    let installed: boolean;
    try {
      installed = await response.json();
      if (this._installed !== installed) {
        this._installed = installed;
        this._onChange();
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

  set status(status: IKiteStatus | null) {
    this._kiteStatus = status;
    this._onChange();
  }

  get icon(): LabIcon {
    return this._icon;
  }

  get reloadRequired(): boolean {
    return this._disconnected;
  }

  get message(): {text: string, tooltip: string} {
    if (this._disconnected) {
      return {
        text: 'Kite: disconnected (reload page)',
        tooltip: 'The connection to Kite was interrupted. Save your changes and reload the page to reconnect.',
      };
    }

    // If we have a _kiteStatus, Kite must be considered installed.
    // This makes dev workflows work better.
    if (this.adapter && this._kiteStatus) {
      return {
        text: 'Kite: ' + this._kiteStatus.short,
        tooltip: this._kiteStatus.long,
      };
    }

    if (!this._serverextensionReachable) {
      return {
        text: 'Kite: cannot reach jupyter-kite',
        tooltip:
          'The jupyter-kite server extension could not be reached, and might not be installed.'
      };
    }

    if (!this._installed) {
      return {
        text: 'Kite: not installed',
        tooltip: 'Kite install could not be found.',
      };
    }
    return {
      text: 'Kite: not running',
      tooltip: 'Kite is not reachable.',
    };
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
      this._connection_manager.closed.disconnect(this._connectionClosed);
      this._connection_manager.documents_changed.disconnect(this._onChange);
    }

    if (connection_manager != null) {
      connection_manager.connected.connect(this._onChange);
      connection_manager.initialized.connect(this._onChange);
      connection_manager.closed.connect(this._connectionClosed);
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

  private _connectionClosed = () => {
    this._disconnected = true;
    this._onChange();
  }

  private _onChange = () => {
    this.stateChanged.emit(void 0);
  };

  private _adapter: JupyterLabWidgetAdapter | null = null;
}
