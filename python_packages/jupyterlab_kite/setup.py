import json
import re
from pathlib import Path

import setuptools

LABEXTENSIONS_DIR = Path("jupyterlab_kite/labextensions")
LABEXTENSIONS_INSTALL_DIR = Path("share") / "jupyter" / "labextensions"
LAB_PACKAGE_PATH = LABEXTENSIONS_DIR / "@kiteco" / "jupyterlab-kite" / "package.json"


def get_data_files():
    extension_files = [
        (
            str(LABEXTENSIONS_INSTALL_DIR / file.relative_to(LABEXTENSIONS_DIR).parent),
            [str(file.as_posix())],
        )
        for file in LABEXTENSIONS_DIR.rglob("*.*")
    ]

    extension_files.append(
        (
            str(LABEXTENSIONS_INSTALL_DIR / "@kiteco" / "jupyterlab-kite"),
            ["jupyterlab_kite/install.json"],
        )
    )

    return extension_files


_version = json.loads(LAB_PACKAGE_PATH.read_text(encoding="utf-8"))["version"]
_release = re.findall(
    r"""__release__ = "([^"]*)"$""",
    (Path(__file__).parent / "jupyterlab_kite" / "_version.py").read_text(
        encoding="utf-8"
    ),
    flags=re.MULTILINE,
)[0]

setuptools.setup(
    version=f"{_version}{_release}",
    data_files=get_data_files(),
)