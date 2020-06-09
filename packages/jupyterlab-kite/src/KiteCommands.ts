import { JupyterFrontEnd } from '@jupyterlab/application';
import { ICommandPalette } from '@jupyterlab/apputils';
import { CommandRegistry } from '@lumino/commands';

const category = 'kite';
const commandMap = new Map<string, CommandRegistry.ICommandOptions>([
  [
    'tutorial',
    {
      label: 'Kite: Tutorial',
      execute: () => {
        console.log('Kite: Tutorial');
      }
    }
  ],
  [
    'copilot',
    {
      label: 'Kite: Open Copilot',
      execute: () => {
        window.open('kite://home');
      }
    }
  ],
  [
    'settings',
    {
      label: 'Kite: Engine Settings',
      execute: () => {
        window.open('kite://settings');
      }
    }
  ],
  [
    'help',
    {
      label: 'Kite: Help',
      execute: () => {
        window.open('https://help.kite.com/');
      }
    }
  ]
]);

export function registerKiteCommands(
  app: JupyterFrontEnd,
  palette: ICommandPalette
) {
  commandMap.forEach((options, id) => {
    app.commands.addCommand(id, options);
    palette.addItem({ command: id, category });
  });
}
