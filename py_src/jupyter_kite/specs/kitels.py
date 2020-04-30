from .utils import ShellSpec


class KiteLanguageServer(ShellSpec):
    key = "kitels"
    cmd = "/Applications/Kite.app/Contents/MacOS/kite-lsp"
    languages = ["python"]
    spec = dict(
        display_name="kite",
        mime_types=["text/python", "text/x-ipython"]
    )
