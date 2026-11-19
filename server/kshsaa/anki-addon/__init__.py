"""Scholars Bowl leaderboard for Anki.

Sends how many cards you study each day to the team's leaderboard: the
number of cards, new cards, and minutes for each day, and nothing else (no
card text, no deck names). It sends when Anki opens, when you finish
studying, and after every sync, so cards studied on a phone count once this
computer's Anki syncs them. Each send covers the last 60 days, so a missed
one fills itself in.

Tools > Scholars Bowl leaderboard has the menu: send now, open the board,
and enter your code.
"""

import time

from anki.buildinfo import version as anki_version
from aqt import gui_hooks, mw
from aqt.operations import QueryOp
from aqt.qt import QAction, QMenu, QTimer, qconnect
from aqt.utils import getText, openLink, showInfo, tooltip

from .client import VERSION, SyncError, send_counts
from .stats import daily_counts

DAYS = 60
# between sends nobody asked for, in seconds
AUTO_GAP = 5 * 60

_state = {"last": 0.0, "busy": False}


def _config():
    return mw.addonManager.getConfig(__name__) or {}


def _in_background(task, done):
    # uses_collection=False: a slow network never holds up closing Anki
    try:
        mw.taskman.run_in_background(task, done, uses_collection=False)
    except TypeError:  # an Anki from before that argument
        mw.taskman.run_in_background(task, done)


def _summary(answer):
    week = answer.get("week") or {}
    text = "Scholars Bowl: {:,} cards this week".format(week.get("reviews", 0))
    if week.get("rank"):
        text += ", #{} of {}".format(week["rank"], week["of"])
    return text + "."


def ask_code():
    conf = _config()
    code, ok = getText(
        "Paste the leaderboard code your captain gave you.\n"
        "Only your daily card counts are sent, nothing else.",
        parent=mw,
        title="Scholars Bowl leaderboard",
        default=conf.get("code", ""),
    )
    if ok and code.strip():
        conf["code"] = code.strip().upper()
        mw.addonManager.writeConfig(__name__, conf)
        send(manual=True)


def open_board():
    conf = _config()
    url = conf.get("server", "").rstrip("/") + "/kshsaa-anki"
    if conf.get("code"):
        # after the #, so the code never reaches the site's logs
        url += "#code=" + conf["code"]
    openLink(url)


def send(manual=False, say=False):
    """Send the counts. manual: someone asked, so say what happened either way
    and ignore the wait between sends. say: show the week's standing after."""
    conf = _config()
    code = conf.get("code", "").strip()
    server = conf.get("server", "").strip()
    if not code or not server:
        if manual:
            ask_code()
        return
    if _state["busy"] or not mw.col:
        return
    if not manual and time.time() - _state["last"] < AUTO_GAP:
        return
    _state["busy"] = True

    def read(col):
        counts = daily_counts(col.db, col.sched.day_cutoff, DAYS)
        counts.update(addon=VERSION, anki=anki_version)
        return counts

    def post(payload):
        def done(future):
            _state["busy"] = False
            try:
                answer = future.result()
            except SyncError as e:
                if manual:
                    showInfo("The leaderboard did not take your counts: {}.".format(e), parent=mw)
                return
            except Exception as e:  # a network hiccup never interrupts studying
                if manual:
                    showInfo("Could not send your counts: {}".format(e), parent=mw)
                return
            _state["last"] = time.time()
            if manual or say:
                tooltip(_summary(answer), period=4000)

        _in_background(lambda: send_counts(server, code, payload), done)

    def failed(error):
        _state["busy"] = False
        if manual:
            showInfo("Could not read your review history: {}".format(error), parent=mw)

    QueryOp(parent=mw, op=read, success=post).failure(failed).run_in_background()


def _on_profile_open():
    if _config().get("code"):
        QTimer.singleShot(8000, send)
    else:
        QTimer.singleShot(1500, ask_code)


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
    gui_hooks.profile_did_open.append(_on_profile_open)
    gui_hooks.sync_did_finish.append(lambda: send(say=True))
    gui_hooks.reviewer_will_end.append(send)


_setup()
