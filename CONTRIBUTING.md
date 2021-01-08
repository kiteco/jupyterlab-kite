# Development

Development requires, at a minimum:
- `python >=3.6,<4.0`
- `jupyterlab >=3.0.0,<4.0.0a0`

It is recommended to use a virtual environment (e.g. `virtualenv` or `conda env`)
for development.

Install `jupyter-kite` from source in your virtual environment:

```bash
python -m pip install -e python_packages/jupter_kite --ignore-installed --no-deps -vv
```

Enable the server extension:

```bash
jupyter server extension enable --sys-prefix --py jupyter_kite
```

Install `npm` dependencies, build TypeScript packages, and link
to JupyterLab for development:

```bash
jlpm bootstrap
# if you installed `jupyterlab_kite` before uninstall it before running the next line
jupyter labextension develop python_packages/jupyterlab_kite/ --overwrite
```

> Note: on Windows you may need to enable Developer Mode first, as discussed in [jupyterlab#9564](https://github.com/jupyterlab/jupyterlab/issues/9564)

### Frontend Development

To watch the files and build continuously:

```bash
jlpm watch   # leave this running...
jupyter lab --watch  # ...in another terminal
```

Now after each change to TypesScript files wait until both watchers finish compilation,
and then refresh the JupyterLab in your browser.

> Note: the backend schema is not included in `watch`, and is only refreshed by `build`

To check and fix code style:

```bash
jlpm lint
```
