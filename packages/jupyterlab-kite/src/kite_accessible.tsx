import { ServiceManager } from '@jupyterlab/services';
import { PageConfig } from '@jupyterlab/coreutils';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { ListModel } from '@jupyterlab/extensionmanager';

import { INotification } from 'jupyterlab_toastify';
import React from 'react';
import Semver from 'semver';

import { VirtualDocument } from './virtual/document';
import { DocumentConnectionManager } from './connection_manager';

import '../style/kite_accessible.css';
import { LanguageServerManager } from './manager';

enum Health {
  ServerExtensionUnreachable = 'ServerExtensionUnreachable',
  RequirementsNotMet = 'RequirementsNotMet',
  KiteEngineNotInstalled = 'KiteNotInstalled',
  BelowMinJLabVersion = 'BelowMinJLabVersion',
  IncompatibleJLabLSPPlugin = 'HasIncompatibleJLabLSP',
  JLabKiteHasUpdate = 'JLabKiteHasUpdate',
  Healthy = 'Healthy'
}

const _MinJlabVersion = '2.2.0';

// KiteAccessible must access fetchInstalled, etc
export class KiteAccessible extends ListModel {
  private connectionManager: DocumentConnectionManager;
  private languageServerManager: LanguageServerManager;

  public static CreateAsync = async (
    serviceManager: ServiceManager,
    registery: ISettingRegistry,
    connectionManager: DocumentConnectionManager,
    languageServerManager: LanguageServerManager
  ): Promise<KiteAccessible> => {
    // Use extensionmanager settings because KiteAccessible needs
    // protected ListModel.queryInstalled
    const settings = await registery.load(
      '@jupyterlab/extensionmanager-extension:plugin'
    );
    return new KiteAccessible(
      serviceManager,
      settings,
      connectionManager,
      languageServerManager
    );
  };

  constructor(
    serviceManager: ServiceManager,
    settings: ISettingRegistry.ISettings,
    connectionManager: DocumentConnectionManager,
    languageServerManager: LanguageServerManager
  ) {
    super(serviceManager, settings);
    this.connectionManager = connectionManager;
    this.languageServerManager = languageServerManager;
  }

  public async checkHealth(): Promise<void> {
    try {
      const health = await this.getHealth();
      await this.notifyHealth(health);
      if (health === Health.IncompatibleJLabLSPPlugin) {
        this.trackIncompatiblity();
      }
    } catch (e) {
      console.log('Health check failed:', e);
    }
  }

  private async notifyHealth(health: string): Promise<void> {
    const baseToastOptions = {
      autoClose: false,
      closeOnClick: false,
      className: '--jp-kite-notifcontainer'
    } as {
      // To avoid type mismatch with ToastOptions
      autoClose: number | false;
      closeOnClick: boolean;
      className: string;
    };

    let id: string | number;
    switch (health) {
      case Health.ServerExtensionUnreachable:
        id = await INotification.notify(
          <InnerNotif title="Server Extension Unreachable">
            <p className="--jp-kite-innernotif-main-msg">
              The jupyterlab-kite extension will not work because the
              jupyter-kite server extension could not be reached.
            </p>
            <p>
              To fix this, please ensure the jupyter-kite server extension is
              installed and active (`jupyter serverextension list`), then
              restart the JupyterLab process.
            </p>
            <ButtonBar
              label="Fix This"
              onClick={() => {
                window.open(
                  'https://github.com/kiteco/jupyterlab-kite#installing-the-kite-extension-for-jupyterlab',
                  '_blank'
                );
                INotification.dismiss(id);
              }}
            />
          </InnerNotif>,
          {
            ...baseToastOptions,
            type: 'error'
          }
        );
        break;
      case Health.RequirementsNotMet:
        id = await INotification.notify(
          <InnerNotif title="Kite is missing some dependencies">
            <p className="--jp-kite-innernotif-main-msg">
              The jupyterlab-kite extension will not work because you using an
              unsupported version of JupyterLab and you are missing the desktop
              application.
            </p>
            <p>
              To fix this, please upgrade JupyterLab to version 2.2 or later and
              install the Kite Engine desktop application.
            </p>
            <ButtonBar
              label="Fix This"
              onClick={() => {
                window.open(
                  'https://www.kite.com/download?utm_source=jupyterlab-plugin&utm_content=update-jlab',
                  '_blank'
                );
                INotification.dismiss(id);
              }}
            />
          </InnerNotif>,
          {
            ...baseToastOptions,
            type: 'error'
          }
        );
        break;
      case Health.BelowMinJLabVersion:
        id = await INotification.notify(
          <InnerNotif title="Kite is missing some dependencies">
            <p className="--jp-kite-innernotif-main-msg">
              The jupyterlab-kite extension will not work because you are using
              an unsupported version of JupyterLab.
            </p>
            <p>
              To fix this, please upgrade JupyterLab to version 2.2 or later.
            </p>
            <ButtonBar
              label="Fix This"
              onClick={() => {
                window.open(
                  'https://stackoverflow.com/questions/55772171/how-to-update-jupyterlab-using-conda-or-pip',
                  '_blank'
                );
                INotification.dismiss(id);
              }}
            />
          </InnerNotif>,
          {
            ...baseToastOptions,
            type: 'error'
          }
        );
        break;
      case Health.KiteEngineNotInstalled:
        id = await INotification.notify(
          <InnerNotif title="Kite is missing some dependencies">
            <p className="--jp-kite-innernotif-main-msg">
              The jupyterlab-kite extension will not work because you are
              missing the Kite Engine desktop application.
            </p>
            <p>
              To fix this, please install the Kite Engine desktop application.
            </p>
            <ButtonBar
              label="Fix This"
              onClick={() => {
                window.open(
                  'https://www.kite.com/download?utm_source=jupyterlab-plugin',
                  '_blank'
                );
                INotification.dismiss(id);
              }}
            />
          </InnerNotif>,
          {
            ...baseToastOptions,
            type: 'error'
          }
        );
        break;
      case Health.IncompatibleJLabLSPPlugin:
        id = await INotification.notify(
          <InnerNotif title="Kite may not work properly in your environment">
            <p className="--jp-kite-innernotif-main-msg">
              The jupyterlab-kite extension is incompatible with your JupyterLab
              configuration.
            </p>
            <p>It will not work with the jupyterlab-lsp extension.</p>
            <ButtonBar
              label="Learn More"
              onClick={() => {
                window.open(
                  'https://help.kite.com/article/143-how-to-install-the-jupyterlab-plugin#troubleshooting',
                  '_blank'
                );
                INotification.dismiss(id);
              }}
            />
          </InnerNotif>,
          {
            ...baseToastOptions,
            type: 'warning'
          }
        );
        break;
      case Health.JLabKiteHasUpdate:
        id = await INotification.notify(
          <>
            <InnerNotif title="There is a new version of Kite available">
              <p className="--jp-kite-innernotif-main-msg">
                Please update your jupyterlab-kite extension with the terminal
                commands:
              </p>
              <ul className="--jp-kite-innernotif-list --jp-kite-innernotif-no-bullets">
                <li className="--jp-kite-innernotif-li">
                  pip install --upgrade jupyter-kite
                </li>
                <li className="--jp-kite-innernotif-li">
                  jupyter labextension update @kiteco/jupyterlab-kite
                </li>
              </ul>
              <ButtonBar
                label="Update"
                onClick={() => {
                  window.open(
                    'https://help.kite.com/article/143-how-to-install-the-jupyterlab-plugin#updating-the-plugin'
                  );
                  INotification.dismiss(id);
                }}
              />
            </InnerNotif>
          </>,
          {
            ...baseToastOptions,
            type: 'info'
          }
        );
        break;
    }
  }

  private async getHealth(): Promise<string> {
    try {
      await this.languageServerManager.fetchSessions();
    } catch {
      return Health.ServerExtensionUnreachable;
    }
    const installed = await this.languageServerManager.fetchKiteInstalled();
    const version = PageConfig.getOption('appVersion');
    if (!installed && Semver.lt(version, _MinJlabVersion)) {
      return Health.RequirementsNotMet;
    } else if (!installed) {
      return Health.KiteEngineNotInstalled;
    } else if (Semver.lt(version, _MinJlabVersion)) {
      return Health.BelowMinJLabVersion;
    }

    const pluginMap = await this.queryInstalled(false);
    if (pluginMap['@krassowski/jupyterlab-lsp']) {
      return Health.IncompatibleJLabLSPPlugin;
    }
    if (ListModel.entryHasUpdate(pluginMap['@kiteco/jupyterlab-kite'])) {
      return Health.JLabKiteHasUpdate;
    }

    return Health.Healthy;
  }

  private async trackIncompatiblity(): Promise<void> {
    // Allow using the connection without an actual doucment open
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
      connection.track('mixpanel', 'jupyterlab_incompatibility', {
        type: 'jupyter-lab-lsp'
      });
    }
  }
}

function InnerNotif(props: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <>
      <p className="--jp-kite-innernotif-title">{props.title}</p>
      <div className="--jp-kite-innernotif-body">{props.children}</div>
    </>
  );
}

function ButtonBar(props: {
  label: string;
  onClick: () => void;
}): React.ReactElement {
  return (
    <div className="--jp-kite-buttonbar">
      <div className="--jp-kite-buttonbar-spacer" />
      <button className="--jp-kite-innernotif-button" onClick={props.onClick}>
        {props.label}
      </button>
    </div>
  );
}
