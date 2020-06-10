import { JupyterFrontEnd } from '@jupyterlab/application';
import { ICommandPalette } from '@jupyterlab/apputils';
import { CommandRegistry } from '@lumino/commands';

const category = 'kite';
interface IKiteCommand {
  id: string;
  options: CommandRegistry.ICommandOptions;
}
const cmdIds = {
  tutorial: 'kite:tutorial',
  copilot: 'kite:copilot',
  settings: 'kite:settings',
  help: 'kite:help'
};

const paletteCommands: ReadonlyArray<IKiteCommand> = [
  {
    id: cmdIds.tutorial,
    options: {
      label: 'Kite: Tutorial',
      execute: () => {
        console.log('Kite: Tutorial');
      }
    }
  },
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
        window.open('https://help.kite.com/');
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
