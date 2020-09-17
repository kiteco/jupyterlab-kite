import { ServerConnection, ServiceManager } from '@jupyterlab/services';
import { PageConfig, URLExt } from '@jupyterlab/coreutils';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { ListModel } from '@jupyterlab/extensionmanager';
import { INotification } from 'jupyterlab_toastify';
import { ILanguageServerManager } from './tokens';
import React from 'react';

import '../style/kite_accessible.css';

enum Health {
  RequirementsNotMet = 'RequirementsNotMet',
  KiteEngineNotInstalled = 'KiteNotInstalled',
  BelowMinJLabVersion = 'BelowMinJLabVersion',
  IncompatibleJLabLSPPlugin = 'HasIncompatibleJLabLSP',
  JLabKiteHasUpdate = 'JLabKiteHasUpdate',
  Healthy = 'Healthy'
}

const _MinJlabVersion = '2.2';

// KiteAccessible must access fetchInstalled, etc
export class KiteAccessible extends ListModel {
  public static CreateAsync = async (
    serviceManager: ServiceManager,
    registery: ISettingRegistry
  ): Promise<KiteAccessible> => {
    // Use extensionmanager settings because KiteAccessible needs
    // protected ListModel.queryInstalled
    const settings = await registery.load(
      '@jupyterlab/extensionmanager-extension:plugin'
    );
    return new KiteAccessible(serviceManager, settings);
  };

  constructor(
    serviceManager: ServiceManager,
    settings: ISettingRegistry.ISettings
  ) {
    super(serviceManager, settings);
  }

  public async checkHealth(): Promise<void> {
    const health = await this.getHealth();
    this.notifyHealth(health);
  }

  private async notifyHealth(health: string): Promise<void> {
    switch (health) {
      case Health.RequirementsNotMet:
        INotification.error(
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
          </InnerNotif>,
          {
            buttons: [
              {
                label: 'Fix This',
                callback: () => window.open(''),
                className: '--jp-kite-innernotif-button'
              }
            ]
          }
        );
        break;
      case Health.BelowMinJLabVersion:
        INotification.error(
          <InnerNotif title="Kite is missing some dependencies">
            <p className="--jp-kite-innernotif-main-msg">
              The jupyterlab-kite extension will not work because you are using
              an unsupported version of JupyterLab.
            </p>
            <p>
              To fix this, please upgrade JupyterLab to version 2.2 or later.
            </p>
          </InnerNotif>,
          {
            buttons: [
              {
                label: 'Fix This',
                callback: () => window.open(''),
                className: '--jp-kite-innernotif-button'
              }
            ]
          }
        );
        break;
      case Health.KiteEngineNotInstalled:
        INotification.error(
          <InnerNotif title="Kite is missing some dependencies">
            <p className="--jp-kite-innernotif-main-msg">
              The jupyterlab-kite extension will not work because you are
              missing the Kite Engine desktop application.
            </p>
            <p>
              To fix this, please install the Kite Engine desktop application.
            </p>
          </InnerNotif>,
          {
            buttons: [
              {
                label: 'Fix This',
                callback: () => window.open(''),
                className: '--jp-kite-innernotif-button'
              }
            ]
          }
        );
        break;
      case Health.IncompatibleJLabLSPPlugin:
        INotification.warning(
          <InnerNotif title="Kite may not work properly in your environment">
            <p className="--jp-kite-innernotif-main-msg">
              The jupyterlab-kite extension is incompatible with your JupyterLab
              configuration. It will not work with the jupyterlab-lsp extension.
            </p>
          </InnerNotif>,
          {
            buttons: [
              {
                label: 'Learn More',
                callback: () => window.open(''),
                className: '--jp-kite-innernotif-button'
              }
            ]
          }
        );
        break;
      case Health.JLabKiteHasUpdate:
        const id = await INotification.notify(
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
                  window.open('');
                  INotification.dismiss(id);
                }}
              />
            </InnerNotif>
          </>,
          // ToastOptions
          {
            autoClose: false,
            closeOnClick: false,
            type: 'info',
            className: '--jp-kite-notifcontainer'
          }
        );
        break;
    }
  }

  private async getHealth(): Promise<string> {
    const installed = await this.fetchKiteInstalled();
    const version = PageConfig.getOption('appVersion');
    if (!installed && version < _MinJlabVersion) {
      return Health.RequirementsNotMet;
    } else if (!installed) {
      return Health.KiteEngineNotInstalled;
    } else if (version < _MinJlabVersion) {
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

  private async fetchKiteInstalled(): Promise<boolean> {
    const resp = await ServerConnection.makeRequest(
      this.kiteInstalledUrl,
      { method: 'GET' },
      ServerConnection.makeSettings()
    );
    return resp.ok && (await resp.json());
  }

  private get kiteInstalledUrl(): string {
    return URLExt.join(
      PageConfig.getBaseUrl(),
      ILanguageServerManager.URL_NS,
      'kite_installed'
    );
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
