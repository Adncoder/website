"""Sending the counts to the team's site. Plain Python, no Anki, so it can be
tried from a terminal."""

import json
import ssl
import urllib.error
import urllib.request

VERSION = "1.0"


class SyncError(Exception):
    """The counts did not get through; the message says why, for the player."""


def _open(request, timeout):
    if not request.full_url.startswith("https:"):
        return urllib.request.urlopen(request, timeout=timeout)
    # The computer's own certificates first: a school network that inspects
    # traffic adds its certificate there. Anki's bundled set if that fails.
    try:
        return urllib.request.urlopen(request, timeout=timeout, context=ssl.create_default_context())
    except urllib.error.URLError as e:
        if not isinstance(e.reason, ssl.SSLError):
            raise
        import certifi

        context = ssl.create_default_context(cafile=certifi.where())
        return urllib.request.urlopen(request, timeout=timeout, context=context)


def send_counts(server, code, payload, timeout=20):
    """POST the counts to the leaderboard and return its answer, or raise
    SyncError."""
    url = server.rstrip("/") + "/kshsaa-anki/sync"
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + code,
            "User-Agent": "ScholarsBowlLeaderboard/" + VERSION,
        },
    )
    try:
        with _open(request, timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            message = json.loads(e.read().decode("utf-8")).get("error")
        except Exception:
            message = None
        raise SyncError(message or "the leaderboard answered with error %d" % e.code) from None
    except (urllib.error.URLError, OSError, ValueError) as e:
        raise SyncError("could not reach %s (%s)" % (server, getattr(e, "reason", e))) from None
