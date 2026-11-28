"""Counts for the Scholars Bowl leaderboard, read from Anki's review log.

Nothing here touches Anki's interface, so test_stats.py can run it against a
plain SQLite database.
"""

from datetime import date

DAY = 86400


def season_days(today, least=60):
    """How many Anki days a send covers: every day since the season began on
    the most recent August 1, today included, and never fewer than `least`,
    so a new season's first sends still fill in the weeks before it. `today`
    is the date the current Anki day began on. A season runs through May, so
    in June and July this still reaches back to the August before."""
    start = date(today.year if today.month >= 8 else today.year - 1, 8, 1)
    return max(least, (today - start).days + 1)


def daily_counts(db, day_cutoff, days):
    """Cards studied on each of the last `days` Anki days.

    `db` answers .all(sql, *args) the way mw.col.db does. `day_cutoff` is
    when the current Anki day ends, in epoch seconds (col.sched.day_cutoff),
    so days roll over at the hour set in Anki's preferences, as in Anki's own
    statistics.

    A review is one answer (Again, Hard, Good, or Easy), counted every time a
    card is answered: the number Anki shows as "Studied N cards today".
    Rescheduling cards by hand is not a review. A new card is one answered
    for the first time ever.

    Returns {"from": the date the first day covered began on, "days": a list
    of {day, reviews, cards, newCards, seconds} for the days with reviews,
    oldest first}, where day is the date that Anki day began on and cards is
    how many different cards were answered.
    """
    start = day_cutoff - DAY * days
    answered = "ease > 0 and type < 4"
    rows = db.all(
        "select id, cid, time from revlog where id >= ? and id < ? and " + answered,
        start * 1000,
        day_cutoff * 1000,
    )
    # when each card answered in the window was answered for the first time
    first = dict(
        db.all(
            "select cid, min(id) from revlog where " + answered + " group by cid having min(id) >= ?",
            start * 1000,
        )
    )
    totals = {}
    for review_id, card_id, ms in rows:
        back = (day_cutoff * 1000 - 1 - review_id) // (DAY * 1000)
        t = totals.setdefault(back, {"reviews": 0, "cards": set(), "new": 0, "ms": 0})
        t["reviews"] += 1
        t["cards"].add(card_id)
        t["ms"] += max(0, ms or 0)
        if first.get(card_id) == review_id:
            t["new"] += 1
    out = []
    for back in sorted(totals, reverse=True):
        t = totals[back]
        out.append(
            {
                "day": date.fromtimestamp(day_cutoff - DAY * (back + 1)).isoformat(),
                "reviews": t["reviews"],
                "cards": len(t["cards"]),
                "newCards": t["new"],
                "seconds": int(round(t["ms"] / 1000)),
            }
        )
    return {"from": date.fromtimestamp(start).isoformat(), "days": out}
