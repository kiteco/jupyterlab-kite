from .utils import KiteShellSpec


class KiteLanguageServer(KiteShellSpec):
    key = "kitels"
    languages = ["python"]
    spec = dict(
        display_name="kite",
        mime_types=["text/python", "text/x-ipython"]
    )
