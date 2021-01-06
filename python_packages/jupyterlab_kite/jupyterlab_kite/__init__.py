from ._version import __version__

def _jupyter_labextension_paths():
    return [
        {
            "src": "labextensions/@kiteco/jupyterlab-kite",
            "dest": "@kiteco/jupyterlab-kite",
        }
    ]
