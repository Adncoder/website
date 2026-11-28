"""Tests for __init__.py: when the add-on sends, what it skips, and how it
retries, run against a stand-in for Anki (the parts of aqt it uses), with
sending and counting replaced by fakes.

Run from this folder: python -m unittest test_addon
(The add-on download leaves this file out.)
"""

import importlib.util
import os
import sys
import types
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SERVERS = ["https://awake.example", "https://sleepy.example"]


class Signal:
    def __init__(self):
        self.slots = []

    def connect(self, fn):
        self.slots.append(fn)

    def fire(self):
        for fn in self.slots:
            fn()


class QTimer:
    shots = []

    def __init__(self, parent=None):
        self.timeout = Signal()
        self.interval = None
        self.single = False

    def start(self, ms):
        self.interval = ms

    def stop(self):
        self.interval = None

    def setSingleShot(self, single):
        self.single = single

    @staticmethod
    def singleShot(ms, fn):
        QTimer.shots.append((ms, fn))


class QAction:
    def __init__(self, label, parent=None):
        self.label = label
        self.triggered = Signal()


class QMenu:
    def __init__(self, title, parent=None):
        self.actions = []

    def addAction(self, action):
        self.actions.append(action)


class AddonManager:
    def __init__(self, defaults, saved):
        self.defaults = defaults
        self.saved = saved

    def addonFromModule(self, module):
        return module.split(".")[0]

    def addonConfigDefaults(self, folder):
        return dict(self.defaults)

    def getConfig(self, module):
        return {**self.defaults, **self.saved}

    def writeConfig(self, module, conf):
        self.saved = dict(conf)

    def setConfigAction(self, module, fn):
        self.config_action = fn


class QueryOp:
    """Runs the read at once, as if the collection answered immediately."""

    def __init__(self, parent, op, success):
        self.op, self.success, self.fail = op, success, None

    def failure(self, fn):
        self.fail = fn
        return self

    def run_in_background(self):
        try:
            result = self.op(fake.mw.col)
        except Exception as e:
            self.fail(e)
            return
        self.success(result)


class Thread:
    """Holds the send until the test lets it run, as if it were in flight."""

    waiting = []

    def __init__(self, target, name=None, daemon=None):
        self.target = target
        self.daemon = daemon

    def start(self):
        Thread.waiting.append(self)


def finish_sends():
    while Thread.waiting:
        Thread.waiting.pop(0).target()


fake = types.SimpleNamespace()


def load(code="ABCD-EFGH-JKLM", saved_server="https://old-address.example"):
    """A fresh copy of the add-on in a fresh stand-in Anki. Its saved settings
    look like version 1.0's, which kept the address along with the code."""
    QTimer.shots = []
    Thread.waiting = []
    fake.hooks = types.SimpleNamespace(profile_did_open=[], profile_will_close=[], sync_did_finish=[], reviewer_will_end=[])
    fake.shown, fake.tips, fake.links, fake.typed = [], [], [], ("", False)
    fake.mw = types.SimpleNamespace(
        addonManager=AddonManager({"servers": SERVERS, "code": ""}, {"code": code, "server": saved_server} if code else {}),
        taskman=types.SimpleNamespace(run_on_main=lambda fn: fn()),
        col=types.SimpleNamespace(db=None, sched=types.SimpleNamespace(day_cutoff=1795219200)),
        form=types.SimpleNamespace(menuTools=types.SimpleNamespace(addMenu=lambda menu: setattr(fake, "menu", menu))),
    )
    modules = {
        "anki": types.ModuleType("anki"),
        "anki.buildinfo": types.SimpleNamespace(version="26.05"),
        "aqt": types.SimpleNamespace(gui_hooks=fake.hooks, mw=fake.mw),
        "aqt.operations": types.SimpleNamespace(QueryOp=QueryOp),
        "aqt.qt": types.SimpleNamespace(QAction=QAction, QMenu=QMenu, QTimer=QTimer, qconnect=lambda signal, fn: signal.connect(fn)),
        "aqt.utils": types.SimpleNamespace(
            getText=lambda *a, **k: fake.typed,
            openLink=fake.links.append,
            showInfo=lambda text, **k: fake.shown.append(text),
            tooltip=lambda text, **k: fake.tips.append(text),
        ),
    }
    for name in [n for n in sys.modules if n == "leaderboard_addon" or n.startswith("leaderboard_addon.")]:
        del sys.modules[name]
    sys.modules.update(modules)
    spec = importlib.util.spec_from_file_location("leaderboard_addon", os.path.join(HERE, "__init__.py"), submodule_search_locations=[HERE])
    addon = importlib.util.module_from_spec(spec)
    sys.modules["leaderboard_addon"] = addon
    spec.loader.exec_module(addon)
    addon.threading = types.SimpleNamespace(Thread=Thread)
    # what the review log says, and what the sites do with it
    fake.counts = {"from": "2026-09-22", "days": [{"day": "2026-11-20", "reviews": 40}]}
    fake.windows = []

    def daily_counts(db, cutoff, days):
        fake.windows.append(days)
        return dict(fake.counts)

    addon.daily_counts = daily_counts
    fake.sent, fake.outcome = [], "ok"
    # what the site answers; one older than 1.2's sends no season
    fake.answer = {"ok": True, "week": {"reviews": 40, "rank": 2, "of": 9}}

    def send_counts(servers, code, payload):
        fake.sent.append({"servers": servers, "code": code, "payload": payload})
        if fake.outcome == "asleep":
            raise addon.SyncError("could not reach https://awake.example (timed out)", retry=True)
        if fake.outcome == "refused":
            raise addon.SyncError("that code is not on the leaderboard")
        return dict(fake.answer), servers[-1]

    addon.send_counts = send_counts
    return addon


def open_profile():
    for fn in fake.hooks.profile_did_open:
        fn()
    ms, fn = QTimer.shots.pop()
    fn()
    finish_sends()


class Addon(unittest.TestCase):
    def test_it_sends_on_opening_to_the_addresses_in_its_own_settings(self):
        addon = load()
        open_profile()
        self.assertEqual(len(fake.sent), 1)
        self.assertEqual(fake.sent[0]["servers"], SERVERS, "never the address 1.0 saved with the code")
        self.assertEqual(fake.sent[0]["code"], "ABCD-EFGH-JKLM")
        self.assertEqual(fake.sent[0]["payload"]["addon"], addon.VERSION)
        self.assertEqual(addon._timers["every"].interval, 30 * 60 * 1000)

    def test_an_open_anki_sends_only_when_something_changed(self):
        addon = load()
        open_profile()
        addon._timers["every"].timeout.fire()
        finish_sends()
        self.assertEqual(len(fake.sent), 1, "nothing new: nothing sent")
        fake.counts = {"from": "2026-09-22", "days": [{"day": "2026-11-20", "reviews": 65}]}
        addon._timers["every"].timeout.fire()
        finish_sends()
        self.assertEqual(len(fake.sent), 2)
        for fn in fake.hooks.reviewer_will_end:
            fn()
        finish_sends()
        self.assertEqual(len(fake.sent), 2, "finishing a session with no new answers sends nothing")

    def test_a_send_nobody_took_is_tried_again_later(self):
        addon = load()
        fake.outcome = "asleep"
        open_profile()
        retry = addon._timers["retry"]
        self.assertTrue(retry.single)
        self.assertEqual(retry.interval, 2 * 60 * 1000)
        waits = []
        for _ in range(3):
            retry.timeout.fire()
            finish_sends()
            waits.append(retry.interval // 60000)
        self.assertEqual(waits, [10, 30, 30])
        self.assertEqual(fake.shown, [], "a send nobody asked for fails quietly")
        fake.outcome = "ok"
        retry.timeout.fire()
        finish_sends()
        self.assertIsNone(retry.interval)
        self.assertEqual(addon._state["failures"], 0)
        addon._timers["every"].timeout.fire()
        finish_sends()
        self.assertEqual(len(fake.sent), 5, "once taken, the same counts are not sent again")

    def test_send_now_says_what_happened(self):
        addon = load()
        open_profile()
        addon.send(manual=True)
        finish_sends()
        self.assertEqual(len(fake.sent), 2, "asked for, it sends even with nothing new")
        self.assertEqual(fake.tips[-1], "Scholars Bowl: 40 cards this week, #2 of 9.")
        fake.outcome = "asleep"
        fake.counts = {"from": "2026-09-22", "days": []}
        addon.send(manual=True)
        finish_sends()
        self.assertIn("tries again in 2 minutes", fake.shown[-1])
        fake.outcome = "refused"
        addon.send(manual=True)
        finish_sends()
        self.assertIn("did not take your counts: that code is not on the leaderboard", fake.shown[-1])
        self.assertIsNone(addon._timers["retry"].interval, "trying again would not help a refused code")

    def test_a_send_covers_the_season_since_august_1(self):
        load()
        # noon UTC on Nov 21: the current Anki day began on Nov 20 in any time zone near the US
        fake.mw.col.sched.day_cutoff = 1795262400
        open_profile()
        self.assertEqual(fake.windows, [112], "Aug 1 through Nov 20")

    def test_send_now_says_where_you_stand_for_the_belt(self):
        addon = load()
        open_profile()
        week = {"reviews": 40, "rank": 2, "of": 9}
        holder = {"reviews": 1234, "rank": 1, "of": 9, "belt": True, "behind": 0}
        chaser = {"reviews": 900, "rank": 3, "of": 9, "belt": False, "behind": 1250}
        for season, said in [
            (dict(holder, over=False), " You hold the Season Belt: 1,234 cards this season."),
            (dict(chaser, over=False), " Season: #3 of 9, 1,250 behind the belt."),
            (dict(chaser, reviews=0, rank=None, over=False), ""),
            (dict(holder, over=True), " You won the Season Belt!"),
            (dict(chaser, over=True), ""),
        ]:
            fake.answer = {"ok": True, "week": week, "season": season}
            addon.send(manual=True)
            finish_sends()
            self.assertEqual(fake.tips[-1], "Scholars Bowl: 40 cards this week, #2 of 9." + said)

    def test_one_send_at_a_time(self):
        addon = load()
        for fn in fake.hooks.profile_did_open:
            fn()
        addon.send()
        addon.send(manual=True)
        self.assertEqual(len(Thread.waiting), 1)
        self.assertEqual(fake.tips, ["Already sending your counts."])
        finish_sends()
        self.assertEqual(len(fake.sent), 1)

    def test_entering_a_code_saves_only_the_code(self):
        addon = load(code="")
        for fn in fake.hooks.profile_did_open:
            fn()
        fake.typed = ("wxyz-2345-6789 ", True)
        ms, ask = QTimer.shots.pop()
        ask()
        finish_sends()
        self.assertEqual(fake.mw.addonManager.saved, {"code": "WXYZ-2345-6789"})
        self.assertEqual(fake.sent[-1]["code"], "WXYZ-2345-6789")

    def test_open_the_leaderboard_opens_the_site_that_took_the_counts(self):
        addon = load()
        open_profile()
        addon.open_board()
        self.assertEqual(fake.links, ["https://sleepy.example/kshsaa-anki#code=ABCD-EFGH-JKLM"])

    def test_closing_the_profile_stops_the_timers(self):
        addon = load()
        fake.outcome = "asleep"
        open_profile()
        for fn in fake.hooks.profile_will_close:
            fn()
        self.assertIsNone(addon._timers["every"].interval)
        self.assertIsNone(addon._timers["retry"].interval)

    def test_the_send_runs_on_a_thread_anki_does_not_wait_for(self):
        load()
        for fn in fake.hooks.profile_did_open:
            fn()
        ms, fn = QTimer.shots.pop()
        fn()
        self.assertTrue(Thread.waiting[0].daemon)


if __name__ == "__main__":
    unittest.main()
