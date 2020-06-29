import { JupyterFrontEnd } from '@jupyterlab/application';
import { ICommandPalette } from '@jupyterlab/apputils';
import { CommandRegistry } from '@lumino/commands';
import { toggle } from './adapters/jupyterlab/kite_completer';

export const category = 'kite';
export const cmdIds = {
  tutorial: 'kite:tutorial',
  copilot: 'kite:copilot',
  settings: 'kite:settings',
  help: 'kite:help',
  toggleDocs: 'kite:toggle-docs'
};
export interface IKiteCommand {
  id: string;
  options: CommandRegistry.ICommandOptions;
}

const paletteCommands: ReadonlyArray<IKiteCommand> = [
  {
    id: cmdIds.copilot,
    options: {
      label: 'Kite: Open Copilot',
      execute: () => {
        window.open('kite://home');
      }
    }
  },
  {
    id: cmdIds.settings,
    options: {
      label: 'Kite: Engine Settings',
      execute: () => {
        window.open('kite://settings');
      }
    }
  },
  {
    id: cmdIds.help,
    options: {
      label: 'Kite: Help',
      execute: () => {
        window.open('https://help.kite.com/category/138-jupyterlab-plugin');
      }
    }
  },
  {
    id: cmdIds.toggleDocs,
    options: {
      label: 'Kite: Toggle Docs Panel',
      execute: () => {
        toggle();
      }
    }
  }
];

export function registerKiteCommands(
  app: JupyterFrontEnd,
  palette: ICommandPalette
) {
  // Register palette commands
  paletteCommands.forEach(cmd => {
    app.commands.addCommand(cmd.id, cmd.options);
    palette.addItem({ command: cmd.id, category });
  });
}
