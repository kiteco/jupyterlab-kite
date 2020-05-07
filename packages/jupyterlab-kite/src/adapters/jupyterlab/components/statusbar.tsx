// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.
// Based on the @jupyterlab/codemirror-extension statusbar

import React from 'react';

import { VDomModel, VDomRenderer } from '@jupyterlab/apputils';
import '../../../../style/statusbar.css';

import * as SCHEMA from '../../../_schema';

import { GroupItem, item, TextItem } from '@jupyterlab/statusbar';

import { LabIcon } from '@jupyterlab/ui-components';
import { JupyterLabWidgetAdapter } from '../jl_adapter';
import { VirtualDocument } from '../../../virtual/document';
import { IKiteStatus, LSPConnection } from '../../../connection';
import { DocumentConnectionManager } from '../../../connection_manager';
import { ILanguageServerManager } from '../../../tokens';

import kiteLogo from '../../../../style/icons/kite-logo.svg';

/**
 * StatusBar item.
 */
export class KiteStatus extends VDomRenderer<KiteStatus.Model> {
  /**
   * Construct a new VDomRenderer for the status item.
   */
  constructor() {
    super(new KiteStatus.Model());
    this.addClass(item);
    this.addClass('kite-statusbar-item');
    this.title.caption = 'Kite Status';
  }

  /**
   * Render the status item.
   */
  render() {
    if (!this.model) {
      return null;
    }

    const activeDocument = this.model.adapter.virtual_editor.virtual_document;
    if (!(activeDocument.file_extension === 'py')) {
      this.setHidden(true);
      return null;
    }

    return (
      <GroupItem spacing={4} title={this.model.long_message}>
        <this.model.status_icon.react top={'2px'} kind={'statusBar'} />
        <TextItem source={this.model.short_message} />
      </GroupItem>
    );
  }
}

type StatusCode = 'waiting' | 'initializing' | 'initialized' | 'connecting';

export interface IStatus {
  connected_documents: Set<VirtualDocument>;
  initialized_documents: Set<VirtualDocument>;
  open_connections: Array<LSPConnection>;
  detected_documents: Set<VirtualDocument>;
  status: StatusCode;
}

export namespace KiteStatus {
  /**
   * A VDomModel for the LSP of current file editor/notebook.
   */
  export class Model extends VDomModel {
    server_extension_status: SCHEMA.ServersResponse = null;
    language_server_manager: ILanguageServerManager;
    private _connection_manager: DocumentConnectionManager;
    private icon: LabIcon;

    constructor() {
      super();
      this.icon = new LabIcon({
        name: 'jupyterlab-kite:icon-name',
        svgstr: kiteLogo
      });
      this.icon.bindprops({ className: 'kite-logo' });
    }

    get status(): IKiteStatus {
      const activeDocument = this.adapter.virtual_editor.virtual_document;
      const connection = this.connection_manager.connections.get(
        activeDocument.id_path
      );
      console.log('Found status:', connection.kiteStatus);
      return connection.kiteStatus;
    }

    get status_icon(): LabIcon {
      return this.icon;
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

    private _onChange = () => {
      this.stateChanged.emit(void 0);
    };

    private _adapter: JupyterLabWidgetAdapter | null = null;
  }
}
