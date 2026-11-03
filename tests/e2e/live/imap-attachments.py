#!/usr/bin/env python3
"""Read-only list of the attachments of the emails in the receiver test inbox whose subject contains a marker.

Usage: imap-attachments.py MARKER
Reads UNIPILE_TEST_RECEIVER_EMAIL and UNIPILE_TEST_MAIL_PASSWORD from the environment and prints one JSON object
{"attachments": [{"filename": ..., "contentType": ..., "size": n, "sha256": ...}]} across the distinct Message-IDs.
Folders are opened with EXAMINE (read-only) and bodies fetched with BODY.PEEK, so flags never change. Never prints the
address or the password.
"""
import email
import hashlib
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

seen = set()
attachments = []
with imaplib.IMAP4_SSL(HOST, timeout=60) as client:
    client.login(user, password)
    status, folders = client.list()
    for line in folders or []:
        name = line.decode().split(' "/" ')[-1]
        if "\\Noselect" in line.decode() or client.select(name, readonly=True)[0] != "OK":
            continue
        status, found = client.search(None, "SUBJECT", f'"{marker}"')
        for number in (found[0].split() if status == "OK" and found and found[0] else []):
            status, data = client.fetch(number, "(BODY.PEEK[])")
            if status != "OK" or not data or not isinstance(data[0], tuple):
                continue
            message = email.message_from_bytes(data[0][1])
            message_id = message.get("Message-ID", "").strip() or f"{name}:{number.decode()}"
            if message_id in seen:
                continue
            seen.add(message_id)
            for part in message.walk():
                if part.get_content_disposition() != "attachment" and not part.get_filename():
                    continue
                payload = part.get_payload(decode=True) or b""
                attachments.append(
                    {
                        "filename": part.get_filename(),
                        "contentType": part.get_content_type(),
                        "size": len(payload),
                        "sha256": hashlib.sha256(payload).hexdigest(),
                    }
                )
print(json.dumps({"attachments": attachments}))
