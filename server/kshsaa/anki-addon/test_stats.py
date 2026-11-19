"""Tests for stats.py against a real SQLite review log shaped like Anki's.

Run from this folder: python -m unittest test_stats
(The add-on download leaves this file out.)
"""

import sqlite3
import unittest
from datetime import date, datetime, timedelta

from stats import daily_counts

DAY = 86400


class Db:
    """The one method of mw.col.db that stats.py uses."""

    def __init__(self):
        self.conn = sqlite3.connect(":memory:")
        # Anki's revlog table
        self.conn.execute(
            "create table revlog (id integer primary key, cid integer not null, usn integer not null,"
            " ease integer not null, ivl integer not null, lastIvl integer not null,"
            " factor integer not null, time integer not null, type integer not null)"
        )

    def all(self, sql, *args):
        return self.conn.execute(sql, args).fetchall()

    def answer(self, when, cid, ease=3, ms=8000, kind=1):
        # ids are milliseconds; nudge apart answers given in the same second
        rid = int(when.timestamp() * 1000)
        while self.conn.execute("select 1 from revlog where id = ?", (rid,)).fetchone():
            rid += 1
        self.conn.execute(
            "insert into revlog values (?, ?, 0, ?, 1, 0, 2500, ?, ?)", (rid, cid, ease, ms, kind)
        )


class DailyCounts(unittest.TestCase):
    def setUp(self):
        self.db = Db()
        # the current Anki day ends at 4 AM local time on Nov 19, so it began
        # at 4 AM on Nov 18
        self.cutoff = int(datetime(2026, 11, 19, 4, 0).timestamp())

    def at(self, day, hour, minute=0):
        return datetime(2026, 11, day, hour, minute)

    def test_days_roll_over_at_the_cutoff_hour(self):
        self.db.answer(self.at(18, 4, 0), cid=1)  # the first minute of today
        self.db.answer(self.at(18, 3, 59), cid=2)  # still yesterday's Anki day
        self.db.answer(self.at(19, 3, 59), cid=3)  # after midnight, still today
        result = daily_counts(self.db, self.cutoff, 60)
        self.assertEqual(
            [(d["day"], d["reviews"]) for d in result["days"]],
            [("2026-11-17", 1), ("2026-11-18", 2)],
        )

    def test_every_answer_counts_but_not_rescheduling(self):
        for ease in (1, 1, 3):  # Again twice, then Good: three answers, one card
            self.db.answer(self.at(18, 9), cid=7, ease=ease, ms=5000, kind=0)
        self.db.answer(self.at(18, 10), cid=8, ease=4, ms=2000, kind=1)
        self.db.answer(self.at(18, 11), cid=9, ease=0, ms=0, kind=4)  # Set due date
        self.db.answer(self.at(18, 11), cid=10, ease=0, ms=0, kind=5)  # rescheduled by FSRS
        (today,) = daily_counts(self.db, self.cutoff, 60)["days"]
        self.assertEqual(today, {"day": "2026-11-18", "reviews": 4, "cards": 2, "newCards": 2, "seconds": 17})

    def test_a_card_is_new_only_on_the_day_it_is_first_answered(self):
        self.db.answer(self.at(10, 9), cid=1, kind=0)
        self.db.answer(self.at(11, 9), cid=1, kind=1)
        self.db.answer(datetime(2026, 1, 5, 9), cid=2)  # long before the window
        self.db.answer(self.at(11, 9), cid=2)
        days = {d["day"]: d for d in daily_counts(self.db, self.cutoff, 60)["days"]}
        self.assertEqual(days["2026-11-10"]["newCards"], 1)
        self.assertEqual(days["2026-11-11"]["newCards"], 0)
        self.assertEqual(days["2026-11-11"]["reviews"], 2)

    def test_the_window_and_its_first_day(self):
        self.db.answer(self.at(18, 9), cid=1)
        self.db.answer(datetime(2026, 9, 20, 9), cid=2)  # the oldest day in a 60-day window
        self.db.answer(datetime(2026, 9, 20, 3), cid=3)  # the Anki day before it
        self.db.answer(datetime(2026, 11, 19, 5), cid=4)  # after the cutoff: tomorrow
        result = daily_counts(self.db, self.cutoff, 60)
        self.assertEqual(result["from"], "2026-09-20")
        self.assertEqual([d["day"] for d in result["days"]], ["2026-09-20", "2026-11-18"])

    def test_nothing_studied(self):
        self.assertEqual(daily_counts(self.db, self.cutoff, 60), {"from": "2026-09-20", "days": []})

    def test_day_labels_across_a_clock_change(self):
        # US clocks fall back on Nov 1, 2026; days either side keep their dates
        for day in (31, 1, 2):
            when = datetime(2026, 10, 31, 12) if day == 31 else datetime(2026, 11, day, 12)
            self.db.answer(when, cid=day)
        labels = [d["day"] for d in daily_counts(self.db, self.cutoff, 60)["days"]]
        expected = [(date(2026, 10, 31) + timedelta(days=i)).isoformat() for i in range(3)]
        self.assertEqual(labels, expected)


if __name__ == "__main__":
    unittest.main()
