# Kite Autocomplete Extension for JupyterLab

Kite is an AI-powered programming assistant that helps you write Python code inside JupyterLab. Kite helps you write code faster by saving you keystrokes and showing you the right information at the right time. Learn more about how Kite boosts your JupyterLab editor's capabilities at https://kite.com/integrations/jupyter/. 

At a high level, Kite provides you with:
* 🧠 __[Line-of-Code Completions](https://kite.com/blog/product/launching-line-of-code-completions-going-cloudless-and-17-million-in-funding/)__ powered by machine learning models trained on the entire open source code universe
* 🔍 __[Instant documentation](https://kite.com/copilot/)__ for the symbol underneath your cursor so you save time searching for Python docs


## Requirements

* JupyterLab v2.2.0 and above
* [Kite Engine](https://kite.com/)

Use another editor? Check out [Kite’s other editor integrations](https://kite.com/integrations/).

## Installation

### Installing the Kite Engine

The [Kite Engine](https://kite.com/) needs to be installed in order for the extension to work properly. The extension itself provides the frontend that interfaces with the Kite Engine, which performs all the code analysis and machine learning 100% locally on your computer (no code is sent to a cloud server).

__macOS Instructions__
1. Download the [installer](https://kite.com/download) and open the downloaded `.dmg` file.
2. Drag the Kite icon into the `Applications` folder.
3. Run `Kite.app` to start the Kite Engine.

__Windows Instructions__
1. Download the [installer](https://kite.com/download) and run the downloaded `.exe` file.
2. The installer should run the Kite Engine automatically after installation is complete.

__Linux Instructions__
1. Visit https://kite.com/linux/ to install Kite.
2. The installer should run the Kite Engine automatically after installation is complete.


### Installing the Kite Extension for JupyterLab

When running the Kite Engine for the first time, you'll be guided through a setup process which will allow you to install the JupyterLab extension. You can also install or uninstall the Jupyter extension at any time using the Kite Engine's [plugin manager](https://help.kite.com/article/62-managing-editor-plugins).

Alternatively, you have 2 options to manually install the extension:
1. Search for "Kite" in JupyterLab's built-in extension manager and install from there. You may need to enable the Extension Manager under JupyterLab Settings.
2. Run these commands in your terminal.
```
pip install jupyter-kite
jupyter labextension install @kiteco/jupyterlab-kite
```

[Learn more about why you should use Kite with JupyterLab.](https://kite.com/integrations/jupyter/)


## Usage

The following is a brief guide to using Kite in its default configuration.

### Tutorial

When starting JupyterLab with the Kite Assistant for the first time, you'll be guided through a tutorial that shows you how to use Kite.

![tutorial](https://kite.com/kite-public/tutorial_file.png)

This tutorial will only be displayed once. You can show it again at any time by running the command `Kite: Tutorial` from JupyterLab's command palette.

### Autocompletions

Simply start typing in a saved Python file or Jupyter notebook and Kite will automatically suggest completions for what you're typing. Kite's autocompletions are all labeled with the 🪁 symbol.

![completions](https://kite.com/kite-public/import_statement.png)


### Completion documentation

Kite's completions come with documentation to help you remember how each completion works.

![Completion docs](https://kite.com/kite-public/completion_docs.png)


### Instant Documentation

Kite can show you documentation for the symbols in your code in the separate Copilot application. 

To do so, open Kite's Copilot (visit the URL kite://home in your browser), ensure that the button labeled "Click for docs to follow cursor" in the upper right corner is enabled, and then simply position your cursor over a symbol.

![Copilot](https://kite.com/kite-public/copilot_small.png)


### Commands

Kite comes with several commands that you can run from JupyterLab's command palette.

![commands](https://kite.com/kite-public/commands.png)

|Command|Description|
|:---|:---|
|`Kite: Open Copilot`|Open the Copilot|
|`Kite: Engine Settings`|Open the settings for the Kite Engine|
|`Kite: Tutorial`|Open the Kite tutorial file|
|`Kite: Help`|Open Kite's help website in the browser|
|`Kite: Toggle Docs Panel`|Toggle the docs panel|


## Troubleshooting

Visit our [help docs](https://help.kite.com/category/138-jupyterlab-plugin) for FAQs and troubleshooting support.

Happy coding!


---

#### About Kite 

Kite is built by a team in San Francisco devoted to making programming easier and more enjoyable for all. Follow Kite on
[Twitter](https://twitter.com/kitehq) and get the latest news and programming tips on the
[Kite Blog](https://kite.com/blog).
Kite has been featured in [Wired](https://www.wired.com/2016/04/kites-coding-asssitant-spots-errors-finds-better-open-source/), 
[VentureBeat](https://venturebeat.com/2019/01/28/kite-raises-17-million-for-its-ai-powered-developer-environment/), 
[The Next Web](https://thenextweb.com/dd/2016/04/14/kite-plugin/), and 
[TechCrunch](https://techcrunch.com/2019/01/28/kite-raises-17m-for-its-ai-driven-code-completion-tool/). 
