"""Scholars Bowl leaderboard for Anki.

Sends how many cards you study each day to the team's leaderboard: the
number of cards, new cards, and minutes for each day, plus the version of
Anki and of this add-on, and nothing else (no card text, no deck names). It
sends when Anki opens, when you finish studying, after every sync, and every
half hour while Anki stays open (only when something changed), so cards
studied on a phone count once this computer's Anki syncs them. Each send
covers the last 60 days, so a missed one fills itself in.

The counts go to the first site in config.json's "servers" that takes them.
When none does, the add-on tries again a few minutes later on its own.

Tools > Scholars Bowl leaderboard has the menu: send now, open the board,
and enter your code.
"""

import json
import threading

from anki.buildinfo import version as anki_version
from aqt import gui_hooks, mw
from aqt.operations import QueryOp
from aqt.qt import QAction, QMenu, QTimer, qconnect
from aqt.utils import getText, openLink, showInfo, tooltip

from .client import VERSION, SyncError, send_counts
from .stats import daily_counts

DAYS = 60
# how often an open Anki checks for new counts to send, in minutes
EVERY = 30
# after a send nobody took, the wait before each next try, in minutes; after
# the last, the half-hourly check carries on
RETRY_AFTER = [2, 10, 30]

_state = {
    "busy": False,
    # the counts the leaderboard last took, so an unchanged check sends nothing
    "sent": None,
    # the site that took them, which Open the leaderboard opens: it is awake
    "site": None,
    "failures": 0,
}
_timers = {}


def _config():
    return mw.addonManager.getConfig(__name__) or {}


def _servers():
    """The leaderboard's addresses, in order. Always from this version's own
    config.json, never from what was saved with the player's code, so an
    update can change them: version 1.0 saved its address along with the
    code."""
    defaults = mw.addonManager.addonConfigDefaults(mw.addonManager.addonFromModule(__name__)) or {}
    servers = defaults.get("servers") or [defaults.get("server")]
    return [str(s).strip().rstrip("/") for s in servers if s and str(s).strip()]


def _on_main(fn):
    try:
        mw.taskman.run_on_main(fn)
    except Exception:  # Anki has closed
        pass


def _summary(answer):
    week = answer.get("week") or {}
    text = "Scholars Bowl: {:,} cards this week".format(week.get("reviews", 0))
    if week.get("rank"):
        text += ", #{} of {}".format(week["rank"], week["of"])
    return text + "."


def ask_code():
    code, ok = getText(
        "Paste the leaderboard code your captain gave you.\n"
        "Only your daily card counts are sent, nothing else.",
        parent=mw,
        title="Scholars Bowl leaderboard",
        default=_config().get("code", ""),
    )
    if ok and code.strip():
        # only the code is the player's: the addresses come from config.json
        mw.addonManager.writeConfig(__name__, {"code": code.strip().upper()})
        _state["sent"] = None
        send(manual=True)


def open_board():
    servers = _servers()
    site = _state["site"] or (servers[0] if servers else "")
    if not site:
        return
    url = site + "/kshsaa-anki"
    code = _config().get("code", "")
    if code:
        # after the #, so the code never reaches the site's logs
        url += "#code=" + code
    openLink(url)


def _retry_later():
    _state["failures"] += 1
    minutes = RETRY_AFTER[min(_state["failures"], len(RETRY_AFTER)) - 1]
    _timers["retry"].start(minutes * 60 * 1000)
    return minutes


def send(manual=False, say=False):
    """Send the counts if they changed since the leaderboard last took them.
    manual: someone asked, so send either way and say what happened. say:
    show the week's standing after."""
    code = _config().get("code", "").strip()
    servers = _servers()
    if not code:
        if manual:
            ask_code()
        return
    if not servers:
        if manual:
            showInfo("This copy of the add-on has no leaderboard address. Install it again from the leaderboard page.", parent=mw)
        return
    if _state["busy"]:
        if manual:
            tooltip("Already sending your counts.")
        return
    if not mw.col:
        return
    _state["busy"] = True

    def read(col):
        counts = daily_counts(col.db, col.sched.day_cutoff, DAYS)
        counts.update(addon=VERSION, anki=anki_version)
        return counts

    def post(payload):
        fingerprint = json.dumps(payload, sort_keys=True)
        if not manual and fingerprint == _state["sent"]:
            _state["busy"] = False
            return

        # a thread of its own, which Anki never waits for when it closes
        def work():
            try:
                answer, site = send_counts(servers, code, payload)
                result = ("ok", answer, site)
            except SyncError as e:
                result = ("retry" if e.retry else "refused", str(e), None)
            except Exception as e:
                result = ("retry", str(e), None)
            _on_main(lambda: done(result, fingerprint))

        threading.Thread(target=work, name="scholars-bowl-leaderboard", daemon=True).start()

    def done(result, fingerprint):
        _state["busy"] = False
        kind, info, site = result
        if kind == "ok":
            _state.update(sent=fingerprint, site=site, failures=0)
            _timers["retry"].stop()
            if manual or say:
                tooltip(_summary(info), period=4000)
        elif kind == "retry":
            minutes = _retry_later()
            if manual:
                showInfo(
                    "Could not reach the leaderboard right now ({}). Your counts are safe: the add-on "
                    "tries again in {} minutes by itself.".format(info, minutes),
                    parent=mw,
                )
        else:
            _timers["retry"].stop()
            if manual:
                showInfo("The leaderboard did not take your counts: {}.".format(info), parent=mw)

    def failed(error):
        _state["busy"] = False
        if manual:
            showInfo("Could not read your review history: {}".format(error), parent=mw)

    QueryOp(parent=mw, op=read, success=post).failure(failed).run_in_background()


def _on_profile_open():
    _state.update(sent=None, site=None, failures=0)
    _timers["every"].start(EVERY * 60 * 1000)
    if _config().get("code"):
        QTimer.singleShot(8000, send)
    else:
        QTimer.singleShot(1500, ask_code)


def _on_profile_close():
    _timers["every"].stop()
    _timers["retry"].stop()


def _setup():
    menu = QMenu("Scholars Bowl leaderboard", mw)
    for label, action_fn in (
        ("Send my counts now", lambda: send(manual=True)),
        ("Open the leaderboard", open_board),
        ("Enter my code...", ask_code),
    ):
        action = QAction(label, mw)
        qconnect(action.triggered, action_fn)
        menu.addAction(action)
    mw.form.menuTools.addMenu(menu)
    # the Config button in Tools > Add-ons asks for the code too
    mw.addonManager.setConfigAction(__name__, ask_code)
    # every half hour while Anki stays open, and a retry after a send nobody took
    _timers["every"] = QTimer(mw)
    qconnect(_timers["every"].timeout, send)
    _timers["retry"] = QTimer(mw)
    _timers["retry"].setSingleShot(True)
    qconnect(_timers["retry"].timeout, send)
    gui_hooks.profile_did_open.append(_on_profile_open)
    gui_hooks.profile_will_close.append(_on_profile_close)
    gui_hooks.sync_did_finish.append(lambda: send(say=True))
    gui_hooks.reviewer_will_end.append(send)


_setup()
