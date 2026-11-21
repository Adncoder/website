"""Sending the counts to the team's site. Plain Python, no Anki, so it can be
tried from a terminal and tested (test_client.py).

The add-on knows more than one address for the leaderboard: the always-awake
site first, then the main site. Render's free plan puts the main site to
sleep after 15 minutes without visitors, and it takes about a minute to wake,
so a send waits only briefly on the first site and long enough for a waking
one after that. Every site writes to the same leaderboard.
"""

import json
import ssl
import urllib.error
import urllib.request

VERSION = "1.1"

# seconds to wait on the first site, which is always awake, and on the rest,
# which may need a minute to wake up
FIRST_TIMEOUT = 15
WAKE_TIMEOUT = 75


class SyncError(Exception):
    """The counts did not get through; the message says why, for the player.
    `retry` is whether trying again later could help: no site answered, as
    opposed to the leaderboard turning the code or the counts down."""

    def __init__(self, message, retry=False):
        super().__init__(message)
        self.retry = retry


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


def _post(server, code, payload, timeout):
    request = urllib.request.Request(
        server + "/kshsaa-anki/sync",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + code,
            "User-Agent": "ScholarsBowlLeaderboard/" + VERSION,
        },
    )
    with _open(request, timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def send_counts(servers, code, payload, timeouts=None):
    """POST the counts to the first of `servers` that takes them, and return
    (its answer, that server).

    A site that turns the code or the counts down (400, 401, or 403) ends it:
    every site shares one leaderboard, so the next would say the same. A site
    that cannot be reached, is asleep past its wait, or fails in any other way
    passes the counts to the next. Raises SyncError when none takes them.
    `timeouts` overrides how long to wait on each site, in order."""
    servers = [str(s).strip().rstrip("/") for s in servers if s and str(s).strip()]
    if not servers:
        raise SyncError("this copy of the add-on has no leaderboard address")
    problems = []
    for i, server in enumerate(servers):
        if timeouts is not None:
            timeout = timeouts[min(i, len(timeouts) - 1)]
        else:
            timeout = FIRST_TIMEOUT if i == 0 else WAKE_TIMEOUT
        try:
            return _post(server, code, payload, timeout), server
        except urllib.error.HTTPError as e:
            try:
                message = json.loads(e.read().decode("utf-8")).get("error")
            except Exception:
                message = None
            if e.code in (400, 401, 403):
                raise SyncError(message or "the leaderboard answered with error %d" % e.code) from None
            problems.append("%s answered with error %d" % (server, e.code))
        except (urllib.error.URLError, OSError, ValueError) as e:
            problems.append("could not reach %s (%s)" % (server, getattr(e, "reason", e)))
    raise SyncError("; ".join(problems), retry=True)
