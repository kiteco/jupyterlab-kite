import os
import os.path as osp
import subprocess
import sys
import shutil
from pathlib import Path
from typing import List, Text

from ..schema import SPEC_VERSION
from ..types import (
    KeyedLanguageServerSpecs,
    LanguageServerManagerAPI,
    LanguageServerSpec,
)

# helper scripts for known tricky language servers
HELPERS = Path(__file__).parent / "helpers"

# when building docs, let all specs go through
BUILDING_DOCS = os.environ.get("JUPYTER_KITE_BUILDING_DOCS") is not None


class SpecBase:
    """ Base for a spec finder that returns a spec for starting a language server
    """

    key = ""
    languages = []  # type: List[Text]
    args = []  # type: List[Text]
    spec = {}  # type: LanguageServerSpec

    def __call__(
        self, mgr: LanguageServerManagerAPI
    ) -> KeyedLanguageServerSpecs:  # pragma: no cover
        return {}


class ShellSpec(SpecBase):
    """ Helper for a language server spec for executables on $PATH in the
        notebook server environment.
    """

    cmd = ""

    def __call__(self, mgr: LanguageServerManagerAPI) -> KeyedLanguageServerSpecs:
        for ext in ["", ".cmd", ".bat", ".exe"]:
            cmd = shutil.which(self.cmd + ext)
            if cmd:
                break

        if not cmd and BUILDING_DOCS:  # pragma: no cover
            cmd = self.cmd

        if not cmd:  # pragma: no cover
            return {}

        return {
            self.key: {
                "argv": [cmd, *self.args],
                "languages": self.languages,
                "version": SPEC_VERSION,
                **self.spec,
            }
        }


class KiteShellSpec(SpecBase):
    """Helper for a language server spec for Kite."""

    def locate_kitelsp(self):
        """Detect if kite-lsp is installed and return the installation path."""
        path = ''
        if os.name == 'nt':
            path = 'C:\\Program Files\\Kite\\kite-lsp.exe'
        elif sys.platform.startswith('linux'):
            path = osp.expanduser('~/.local/share/kite/current/kite-lsp')
        elif sys.platform == 'darwin':
            path = self.locate_kitelsp_darwin()
        return path

    def locate_kitelsp_darwin(self):
        """
        Looks up where kite-lsp is installed on macOS systems. The bundle ID
        is checked first and if nothing is found or an error occurs, the
        default path is used.
        """
        default_path = '/Applications/Kite.app'
        path = ''
        bundle_path = "/Contents/MacOS/kite-lsp"
        try:
            out = subprocess.check_output(
                ['mdfind', 'kMDItemCFBundleIdentifier="com.kite.Kite"'])
            installed = len(out) > 0
            path = (out.decode('utf-8', 'replace').strip().split('\n')[0]
                    if installed else default_path)
        except (subprocess.CalledProcessError, UnicodeDecodeError):
            # Use the default path
            path = default_path
        finally:
            return path + bundle_path

    cmd = property(locate_kitelsp)

    def __call__(self, mgr: LanguageServerManagerAPI) -> KeyedLanguageServerSpecs:
        return {
            self.key: {
                "argv": [self.cmd, *self.args],
                "languages": self.languages,
                "version": SPEC_VERSION,
                **self.spec,
            }
        }


class NodeModuleSpec(SpecBase):
    """ Helper for a nodejs-based language server spec in one of several
        node_modules
    """

    node_module = ""
    script = []  # type: List[Text]

    def __call__(self, mgr: LanguageServerManagerAPI) -> KeyedLanguageServerSpecs:
        node_module = mgr.find_node_module(self.node_module, *self.script)

        if not node_module:  # pragma: no cover
            return {}

        return {
            self.key: {
                "argv": [mgr.nodejs, node_module, *self.args],
                "languages": self.languages,
                "version": SPEC_VERSION,
                **self.spec,
            }
        }
