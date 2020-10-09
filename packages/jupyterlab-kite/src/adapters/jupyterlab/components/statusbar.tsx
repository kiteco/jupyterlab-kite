// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.
// Based on the @jupyterlab/codemirror-extension statusbar

import React from 'react';

import { VDomRenderer } from '@jupyterlab/apputils';
import { GroupItem, item, TextItem } from '@jupyterlab/statusbar';

import { KiteStatusModel } from './status_model';

import '../../../../style/statusbar.css';

/**
 * StatusBar item.
 */
export class KiteStatus extends VDomRenderer<KiteStatusModel> {
  /**
   * Construct a new VDomRenderer for the status item.
   */
  constructor(model: KiteStatusModel) {
    super(model);
    this.addClass(item);
    this.addClass('kite-statusbar-item');
    this.title.caption = 'Kite Status';
  }

  /**
   * Render the status item.
   */
  render() {
    if (!this.model || !this.model.activeDocument) {
      return null;
    }

    const activeDocument = this.model.activeDocument;
    if (!(activeDocument.file_extension === 'py')) {
      this.setHidden(true);
      return null;
    }

    if (activeDocument.document_info) {
      this.model.refresh(activeDocument.document_info);
    }

    const props: React.HTMLAttributes<HTMLDivElement> = {};
    if (this.model.reloadRequired) {
      props.style = { cursor: 'pointer' };
      props.onClick = () => window.location.reload();
    }

    return (
      <GroupItem {...props} spacing={4} title={this.model.message.tooltip}>
        <this.model.icon.react top={'2px'} kind={'statusBar'} />
        <TextItem source={this.model.message.text} />
      </GroupItem>
    );
  }
}
