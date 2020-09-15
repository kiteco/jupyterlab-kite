import {
  ServerConnection,
  ServiceManager,
  KernelAPI
} from '@jupyterlab/services';
import { PageConfig, URLExt } from '@jupyterlab/coreutils';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { ListModel } from '@jupyterlab/extensionmanager';
import { INotification } from 'jupyterlab_toastify';
import { ILanguageServerManager } from './tokens';
import React from 'react';

enum Health {
  RequirementsNotMet = 'RequirementsNotMet',
  KiteEngineNotInstalled = 'KiteNotInstalled',
  BelowMinJLabVersion = 'BelowMinJLabVersion',
  IncompatibleJLabLSPPlugin = 'HasIncompatibleJLabLSP',
  IncompatibleMultipleKernels = 'HasMultipleKernels',
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
    if (health === Health.Healthy) {
      this.pollMultipleKernalHealth();
    }
  }

  private async notifyHealth(health: string): Promise<void> {
    switch (health) {
      case Health.RequirementsNotMet:
        INotification.error(
          <InnerNotif title="Kite is missing some dependencies">
            <p style={{ marginBottom: '0.2em' }}>
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
                callback: () => window.open('')
              }
            ]
          }
        );
        break;
      case Health.BelowMinJLabVersion:
        INotification.error(
          <InnerNotif title="Kite is missing some dependencies">
            <p style={{ marginBottom: '0.2em' }}>
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
                callback: () => window.open('')
              }
            ]
          }
        );
        break;
      case Health.KiteEngineNotInstalled:
        INotification.error(
          <InnerNotif title="Kite is missing some dependencies">
            <p style={{ marginBottom: '0.2em' }}>
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
                callback: () => window.open('')
              }
            ]
          }
        );
        break;
      case Health.IncompatibleJLabLSPPlugin:
      case Health.IncompatibleMultipleKernels:
        INotification.warning(
          <InnerNotif title="Kite may not work properly in your environment">
            <p style={{ marginBottom: '0.2em' }}>
              The jupyterlab-kite extension is incompatible with your JupyterLab
              configuration. It will not work with:
            </p>
            <ul style={{ margin: 0 }}>
              <li>jupyterlab-lsp extension</li>
              <li>Multiple kernels</li>
            </ul>
          </InnerNotif>,
          {
            buttons: [
              {
                label: 'Learn More',
                callback: () => window.open('')
              }
            ]
          }
        );
        break;
      case Health.JLabKiteHasUpdate:
        INotification.info(
          <InnerNotif title="There is a new version of Kite available">
            <p style={{ marginBottom: '0.2em' }}>
              Please update your jupyterlab-kite extension with the terminal
              commands:
            </p>
            <ul style={{ listStyleType: 'none', margin: 0 }}>
              <li>pip install --upgrade jupyter-kite</li>
              <li>jupyter labextension update @kiteco/jupyterlab-kite</li>
            </ul>
          </InnerNotif>,
          {
            buttons: [
              {
                label: 'Update',
                callback: () => window.open('')
              }
            ]
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

    const running = await KernelAPI.listRunning();
    if (this.hasMultipleKernels(running)) {
      return Health.IncompatibleMultipleKernels;
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

  private pollMultipleKernalHealth(): void {
    const interval = setInterval(async () => {
      const running = await KernelAPI.listRunning();
      if (this.hasMultipleKernels(running)) {
        // Only notify once
        clearInterval(interval);
        this.notifyHealth(Health.IncompatibleMultipleKernels);
      }
    }, 3000);
  }

  private hasMultipleKernels(running: KernelAPI.IModel[]): boolean {
    const uniqueRunningKernels = running.reduce(
      (uniques: Set<string>, session: KernelAPI.IModel) => {
        return uniques.add(session.name);
      },
      new Set()
    );
    return uniqueRunningKernels.size > 1;
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

function InnerNotif(props: any): React.ReactElement {
  return (
    <>
      <p style={{ marginBottom: '0.5em' }}>{props.title}</p>
      <div style={{ marginBottom: '0.3em' }}>{props.children}</div>
    </>
  );
}
