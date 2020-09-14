import {
  ServerConnection,
  ServiceManager,
  KernelAPI
} from '@jupyterlab/services';
import { PageConfig, URLExt } from '@jupyterlab/coreutils';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { ListModel } from '@jupyterlab/extensionmanager';
import { ILanguageServerManager } from './tokens';

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
        break;
      case Health.KiteEngineNotInstalled:
        break;
      case Health.BelowMinJLabVersion:
        break;
      case Health.IncompatibleJLabLSPPlugin:
      case Health.IncompatibleMultipleKernels:
        this._incompatibleNotified = true;
        break;
      case Health.JLabKiteHasUpdate:
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
