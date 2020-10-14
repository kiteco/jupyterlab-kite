import { VDomModel } from '@jupyterlab/apputils';
import { LabIcon } from '@jupyterlab/ui-components';

import { isEqual } from 'lodash';

import { JupyterLabWidgetAdapter } from '../jl_adapter';
import { LSPConnection } from '../../../connection';

import kiteLogo from '../../../../style/icons/kite-logo.svg';
import { IDocumentInfo } from 'lsp-ws-connection';
import { LanguageServerManager } from '../../../manager';

export interface IKiteStatus {
  status: string;
  short: string;
  long: string;
}

export const EmptyKiteStatus = { status: '', short: '', long: '' };

export interface State {
  disconnected: boolean;
  kiteUninstalled: boolean;
  serverUnreachable: boolean;
  kiteStatus: IKiteStatus;
}

/**
 * A VDomModel for the LSP of current file editor/notebook.
 */
export class KiteStatusModel extends VDomModel {
  private _language_server_manager: LanguageServerManager;
  private _icon: LabIcon = new LabIcon({
    name: 'jupyterlab-kite:status-icon',
    svgstr: kiteLogo
  });
  private _state: State;
  private _adapter: JupyterLabWidgetAdapter | null = null;

  constructor(language_server_manager: LanguageServerManager) {
    super();

    this._language_server_manager = language_server_manager;
    this.icon.bindprops({ className: 'kite-logo' });
    this._state = {
      kiteUninstalled: false,
      serverUnreachable: false,
      disconnected: false,
      kiteStatus: EmptyKiteStatus
    };
  }

  async refresh(connection?: LSPConnection, documentInfo?: IDocumentInfo) {
    // Check /lsp/status for server reachability
    try {
      await this.languageServerManager.fetchSessions();
    } catch (err) {
      console.warn('Could not get server status:', err);
      this.setState({ serverUnreachable: true });
      return;
    }

    // Check if Kite engine is installed
    const installed = await this.languageServerManager.fetchKiteInstalled();
    if (!installed) {
      console.warn('Kite engine not installed');
      this.setState({ kiteUninstalled: true });
      return;
    }

    if (this.reloadRequired) {
      return;
    }

    // Get status from Kite Engine
    if (connection && documentInfo) {
      const kiteStatus = await connection.fetchKiteStatus(documentInfo);
      this.setState({ kiteStatus });
    }
  }

  get languageServerManager(): LanguageServerManager {
    return this._language_server_manager;
  }

  get icon(): LabIcon {
    return this._icon;
  }

  get reloadRequired(): boolean {
    return this.state.disconnected;
  }

  get message(): { text: string; tooltip: string } {
    if (this.state.serverUnreachable) {
      return {
        text: 'Kite: server extension unreachable',
        tooltip: 'The jupyter-kite server extension could not be reached.'
      };
    }

    if (this.state.kiteUninstalled) {
      return {
        text: 'Kite: engine not installed',
        tooltip: 'Kite engine install could not be found.'
      };
    }

    if (this.reloadRequired) {
      return {
        text: 'Kite: disconnected (reload page)',
        tooltip:
          'The connection to Kite was interrupted. Save your changes and reload the page to reconnect.'
      };
    }

    if (this.adapter && this.state.kiteStatus.status) {
      return {
        text: 'Kite: ' + this.state.kiteStatus.short,
        tooltip: this.state.kiteStatus.long
      };
    }

    return {
      text: 'Kite: not running',
      tooltip: 'Kite is not reachable.'
    };
  }

  get adapter(): JupyterLabWidgetAdapter | null {
    return this._adapter;
  }

  set adapter(adapter: JupyterLabWidgetAdapter | null) {
    if (this._adapter) {
      this._adapter.connection_manager.closed.disconnect(
        this._connectionClosed
      );
    }
    if (adapter) {
      adapter.connection_manager.closed.connect(this._connectionClosed);
    }
    this._adapter = adapter;
  }

  get state(): State {
    return this._state;
  }

  /**
   * Loosely based on React's setState.
   * Only signals a change if the potential new state
   * is not deeply equal to the current state.
   */
  setState<K extends keyof State>(newValues: Pick<State, K>) {
    const merged = { ...this._state, ...newValues };
    if (!isEqual(this._state, merged)) {
      this._state = merged;
      this._onChange();
    }
  }

  private _connectionClosed = () => {
    this.setState({ disconnected: true });
  };

  private _onChange = () => {
    this.stateChanged.emit(void 0);
  };
}
