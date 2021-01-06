import re
import sys
from pathlib import Path

import setuptools

setuptools.setup(
    version=re.findall(
        r"""__version__ = "([^"]+)"$""",
        (Path(__file__).parent / "jupyter_kite" / "_version.py").read_text(
            encoding="utf-8"
        ),
    )[0],
    setup_requires=["pytest-runner"] if "test" in sys.argv else [],
    data_files=[
        (
            "etc/jupyter/jupyter_server_config.d",
            ["jupyter_kite/etc/jupyter-kite-serverextension.json"],
        )
    ],
)