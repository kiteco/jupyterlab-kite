import os
import os.path as osp
import subprocess
import sys


class KiteLocator:
    def check_if_kite_installed(self):
        """Detect if kite is installed and return the installation path."""
        path = ''
        if os.name == 'nt':
            path = 'C:\\Program Files\\Kite\\kited.exe'
        elif sys.platform.startswith('linux'):
            path = osp.expanduser('~/.local/share/kite/kited')
        elif sys.platform == 'darwin':
            path = self.locate_kite_darwin()
        return osp.exists(osp.realpath(path)), path

    def locate_kite_darwin(self):
        """
        Looks up where Kite.app is installed on macOS systems. The bundle ID
        is checked first and if nothing is found or an error occurs, the
        default path is used.
        """
        default_path = '/Applications/Kite.app'
        path = ''
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
            return path
