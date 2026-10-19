#!/usr/bin/env python3
"""Read-only count of the emails in the receiver test inbox whose subject contains a marker.

Usage: imap-count.py MARKER
Reads UNIPILE_TEST_RECEIVER_EMAIL and UNIPILE_TEST_MAIL_PASSWORD from the environment and prints one JSON object
{"count": n}: distinct Message-IDs across every folder. Folders are opened with EXAMINE (read-only), so flags never
change. Never prints the address or the password. The mailbox is reached directly because the provider's own email
listing can show a delivered email minutes late.
"""
import email
import imaplib
import json
import os
import sys

HOST = "imap.forwardemail.net"

marker = sys.argv[1] if len(sys.argv) > 1 else ""
user = os.environ.get("UNIPILE_TEST_RECEIVER_EMAIL", "")
password = os.environ.get("UNIPILE_TEST_MAIL_PASSWORD", "")
if not (marker and user and password) or '"' in marker:
    print(json.dumps({"error": "missing marker or credentials"}))
    sys.exit(2)

ids = set()
with imaplib.IMAP4_SSL(HOST, timeout=60) as client:
    client.login(user, password)
    status, folders = client.list()
    for line in folders or []:
        name = line.decode().split(' "/" ')[-1]
        if "\\Noselect" in line.decode():
            continue
        if client.select(name, readonly=True)[0] != "OK":
            continue
        status, found = client.search(None, "SUBJECT", f'"{marker}"')
        for number in (found[0].split() if status == "OK" and found and found[0] else []):
            status, data = client.fetch(number, "(BODY.PEEK[HEADER.FIELDS (MESSAGE-ID)])")
            if status == "OK" and data and isinstance(data[0], tuple):
                message_id = email.message_from_bytes(data[0][1]).get("Message-ID", "").strip()
                ids.add(message_id or f"{name}:{number.decode()}")
print(json.dumps({"count": len(ids)}))
