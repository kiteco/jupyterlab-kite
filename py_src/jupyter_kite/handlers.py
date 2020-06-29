""" tornado handler for managing and communicating with language servers
"""
import json
from typing import Optional, Text

from notebook.base.handlers import IPythonHandler
from notebook.base.zmqhandlers import WebSocketHandler, WebSocketMixin
from notebook.utils import url_path_join as ujoin

from .locator import KiteLocator
from .onboarding import KiteOnboardingHandler
from .manager import LanguageServerManager
from .schema import SERVERS_RESPONSE


class BaseHandler(IPythonHandler):
    manager = None  # type: LanguageServerManager

    def initialize(self, manager: LanguageServerManager):
        self.manager = manager


class LanguageServerWebSocketHandler(WebSocketMixin, WebSocketHandler, BaseHandler):
    """ Setup tornado websocket to route to language server sessions
    """

    language_server = None  # type: Optional[Text]

    def initialize(self, *args, **kwargs):
        super().initialize(kwargs["manager"])
        self.contents = kwargs["contents"]
        self.onboarding_handler = KiteOnboardingHandler()

    def open(self, language_server):
        self.language_server = language_server
        self.manager.subscribe(self)
        self.log.debug("[{}] Opened a handler".format(self.language_server))

    async def on_message(self, message):
        self.log.debug("[{}] Handling a message".format(self.language_server))
        processed_message = self.onboarding_handler.process_message(
            self.contents, message)
        await self.manager.on_client_message(processed_message, self)

    def on_close(self):
        self.manager.unsubscribe(self)
        self.log.debug("[{}] Closed a handler".format(self.language_server))


class LanguageServersHandler(BaseHandler):
    """ Reports the status of all current servers

        Response should conform to schema in schema/servers.schema.json
    """

    validator = SERVERS_RESPONSE

    def initialize(self, *args, **kwargs):
        super().initialize(kwargs["manager"])

    def get(self):
        """ finish with the JSON representations of the sessions
        """
        response = {
            "version": 2,
            "sessions": {
                language_server: session.to_json()
                for language_server, session in self.manager.sessions.items()
            },
        }

        errors = list(self.validator.iter_errors(response))

        if errors:  # pragma: no cover
            self.log.warn("{} validation errors: {}", len(errors), errors)

        self.finish(response)


class KiteInstalledHandler(BaseHandler):
    """
    Reports if Kite is installed
    """

    def initialize(self, *args, **kwargs):
        super().initialize(kwargs["manager"])
        self.locator = KiteLocator()

    def get(self):
        exists, _ = self.locator.check_if_kite_installed()
        exists = json.dumps(exists)
        response = exists
        self.finish(response)


def add_handlers(nbapp):
    """ Add Language Server routes to the notebook server web application
    """
    lsp_url = ujoin(nbapp.base_url, "lsp")
    re_langservers = "(?P<language_server>.*)"

    opts = {"manager": nbapp.language_server_manager,
            "contents": nbapp.contents_manager}

    nbapp.web_app.add_handlers(
        ".*",
        [
            (ujoin(lsp_url, "status"), LanguageServersHandler, opts),
            (
                ujoin(lsp_url, "ws", re_langservers),
                LanguageServerWebSocketHandler,
                opts,
            ),
            (ujoin(lsp_url, "kite_installed"), KiteInstalledHandler, opts),
        ],
    )
