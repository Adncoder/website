"""Tests for client.py: which site takes the counts, against real local web
servers playing each part (awake, asleep, broken, refusing, gone).

Run from this folder: python -m unittest test_client
(The add-on download leaves this file out.)
"""

import json
import socket
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from client import SyncError, send_counts


def site(status=200, answer=None, delay=0):
    """A local site that answers /kshsaa-anki/sync, and the requests it saw."""
    seen = []

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            seen.append({"path": self.path, "auth": self.headers.get("Authorization"), "body": json.loads(body)})
            time.sleep(delay)
            data = json.dumps(answer if answer is not None else {"ok": True}).encode()
            try:
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except OSError:  # the add-on gave up waiting
                pass

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return "http://127.0.0.1:%d" % server.server_address[1], seen, server


def nothing_there():
    """An address where nothing is listening."""
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return "http://127.0.0.1:%d" % port


PAYLOAD = {"from": "2026-09-22", "days": [{"day": "2026-11-20", "reviews": 120, "cards": 80, "newCards": 20, "seconds": 900}]}


class SendCounts(unittest.TestCase):
    def setUp(self):
        self.servers = []

    def tearDown(self):
        for s in self.servers:
            s.shutdown()
            s.server_close()

    def site(self, **kwargs):
        url, seen, server = site(**kwargs)
        self.servers.append(server)
        return url, seen

    def test_the_first_site_that_answers_takes_them(self):
        first, seen1 = self.site(answer={"ok": True, "name": "Avery"})
        second, seen2 = self.site()
        answer, used = send_counts([first, second], "ABCD-EFGH-JKLM", PAYLOAD)
        self.assertEqual(answer["name"], "Avery")
        self.assertEqual(used, first)
        self.assertEqual(len(seen1), 1)
        self.assertEqual(seen2, [])
        self.assertEqual(seen1[0]["path"], "/kshsaa-anki/sync")
        self.assertEqual(seen1[0]["auth"], "Bearer ABCD-EFGH-JKLM")
        self.assertEqual(seen1[0]["body"], PAYLOAD)

    def test_a_site_that_is_gone_passes_them_on(self):
        second, seen2 = self.site()
        _, used = send_counts([nothing_there(), second + "/"], "CODE", PAYLOAD)
        self.assertEqual(used, second)
        self.assertEqual(len(seen2), 1)

    def test_a_site_still_waking_up_passes_them_on(self):
        asleep, _ = self.site(delay=2)
        awake, seen = self.site()
        started = time.time()
        _, used = send_counts([asleep, awake], "CODE", PAYLOAD, timeouts=[0.5, 5])
        self.assertEqual(used, awake)
        self.assertLess(time.time() - started, 2, "it gave up on the sleeping site after its wait")
        self.assertEqual(len(seen), 1)

    def test_a_broken_site_passes_them_on(self):
        broken, _ = self.site(status=500, answer={"error": "boom"})
        busy, _ = self.site(status=429, answer={"error": "too many sends this hour"})
        good, seen = self.site()
        _, used = send_counts([broken, busy, good], "CODE", PAYLOAD)
        self.assertEqual(used, good)
        self.assertEqual(len(seen), 1)

    def test_a_refused_code_stops_there(self):
        refusing, _ = self.site(status=401, answer={"error": "that code is not on the leaderboard: check it with your captain"})
        other, seen = self.site()
        with self.assertRaises(SyncError) as caught:
            send_counts([refusing, other], "WRONG", PAYLOAD)
        self.assertFalse(caught.exception.retry)
        self.assertIn("not on the leaderboard", str(caught.exception))
        self.assertEqual(seen, [], "every site shares one board, so the next would say the same")

    def test_when_nobody_takes_them_it_says_to_try_later(self):
        broken, _ = self.site(status=503)
        with self.assertRaises(SyncError) as caught:
            send_counts([nothing_there(), broken], "CODE", PAYLOAD, timeouts=[1, 1])
        self.assertTrue(caught.exception.retry)
        self.assertIn("could not reach", str(caught.exception))
        self.assertIn("error 503", str(caught.exception))

    def test_no_address_at_all(self):
        with self.assertRaises(SyncError) as caught:
            send_counts(["", None], "CODE", PAYLOAD)
        self.assertFalse(caught.exception.retry)


if __name__ == "__main__":
    unittest.main()
