"""
IntroDB submission helper for notify_skip (run by the bundled python.exe).

Why this exists: Kai's mpv.conf sets log-file, and mpv writes every command,
property set and subprocess stdin_data into LOG.txt. The API key must never
pass through mpv, so it travels sealed with a Diffie-Hellman exchange:

  pubkey  - load or create this install's private exponent (kept in a state
            file under portable_config/cache) and print the public value.
            Lua publishes it in user-data/kai/introdb-pubkey; the web page
            observes that property.
  submit  - the page sealed the key with its own ephemeral exponent and sent
            (page_pub, sealed). Only public values reached mpv. Recompute the
            shared secret, unseal the key, and POST the segment to IntroDB.
  validate - unseal a key typed in Settings and check it with IntroDB
            without creating anything (see cmd_validate).

Output is a single JSON object on stdout. Errors never include the key.
"""

import hashlib
import json
import os
import secrets
import sys
import urllib.error
import urllib.request

# RFC 7919 ffdhe2048 group (safe prime, generator 2)
P = int(
    "FFFFFFFFFFFFFFFFADF85458A2BB4A9AAFDC5620273D3CF1D8B9C583CE2D3695"
    "A9E13641146433FBCC939DCE249B3EF97D2FE363630C75D8F681B202AEC4617A"
    "D3DF1ED5D5FD65612433F51F5F066ED0856365553DED1AF3B557135E7F57C935"
    "984F0C70E0E68B77E2A689DAF3EFE8721DF158A136ADE73530ACCA4F483A797A"
    "BC0AB182B324FB61D108A94BB2C8E3FBB96ADAB760D7F4681D4F42A3DE394DF4"
    "AE56EDE76372BB190B07A7C8EE0A6D709E02FCE1CDF7E2ECC03404CD28342F61"
    "9172FE9CE98583FF8E4F1232EEF28183C3FE3B1B4C6FAD733BB5FCBC2EC22005"
    "C58EF1837D1683B2C6F34A26C1B2EFFA886B423861285C97FFFFFFFFFFFFFFFF",
    16,
)
G = 2
KDF_LABEL = b"kai-introdb-key-v1"


def out(obj):
    sys.stdout.write(json.dumps(obj))


def load_private(state_path):
    try:
        with open(state_path, "r", encoding="utf-8") as f:
            x = int(json.load(f)["x"], 16)
        if 2 <= x < P - 1:
            return x
    except (OSError, ValueError, KeyError, TypeError):
        pass
    x = secrets.randbits(256) | (1 << 255)
    os.makedirs(os.path.dirname(state_path) or ".", exist_ok=True)
    with open(state_path, "w", encoding="utf-8") as f:
        json.dump({"x": format(x, "x")}, f)
    return x


def keystream(shared, length):
    s_bytes = shared.to_bytes(256, "big")
    stream = b""
    counter = 0
    while len(stream) < length:
        stream += hashlib.sha256(s_bytes + KDF_LABEL + counter.to_bytes(4, "big")).digest()
        counter += 1
    return stream[:length]


def unseal(state_path, page_pub_hex, sealed_hex):
    page_pub = int(page_pub_hex, 16)
    if not 1 < page_pub < P - 1:
        raise ValueError("invalid page public value")
    sealed = bytes.fromhex(sealed_hex)
    if not 0 < len(sealed) <= 256:
        raise ValueError("invalid sealed key length")
    shared = pow(page_pub, load_private(state_path), P)
    key = bytes(a ^ b for a, b in zip(sealed, keystream(shared, len(sealed))))
    text = key.decode("ascii")  # raises on garbage (mismatched exchange)
    if not text.isprintable() or " " in text:
        raise ValueError("garbage")
    return text


def cmd_pubkey(state_path):
    out({"pub": format(pow(G, load_private(state_path), P), "x")})


def post(url, api_key, body_json):
    """POST to IntroDB. Returns {status, body} or {status: 0, error}."""
    req = urllib.request.Request(
        url,
        data=body_json.encode("utf-8"),
        method="POST",
        headers={"X-API-Key": api_key, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return {"status": r.status, "body": r.read().decode("utf-8", "replace")}
    except urllib.error.HTTPError as e:
        return {"status": e.code, "body": e.read().decode("utf-8", "replace")}
    except Exception as e:  # network failure, timeout, DNS, TLS
        return {"status": 0, "error": type(e).__name__ + ": " + str(getattr(e, "reason", e))}


def error_text(res, fallback):
    try:
        return json.loads(res.get("body") or "")["error"]
    except (ValueError, KeyError, TypeError):
        return fallback


def cmd_submit(state_path, url, page_pub_hex, sealed_hex, body_json):
    try:
        api_key = unseal(state_path, page_pub_hex, sealed_hex)
    except (ValueError, UnicodeDecodeError):
        out({"status": 0, "error": "Key exchange mismatch. Reopen the player and try again."})
        return
    out(post(url, api_key, body_json))


def cmd_validate(state_path, url, page_pub_hex, sealed_hex):
    """
    Check a key without creating anything: POST an empty body to /submit.
    IntroDB authenticates before validating the payload, so a bad key gets
    401 and a good one gets 400 "Invalid payload." An empty body can never
    create a submission.
    """
    try:
        api_key = unseal(state_path, page_pub_hex, sealed_hex)
    except (ValueError, UnicodeDecodeError):
        out({"result": "unknown", "error": "Key exchange mismatch. Reopen Settings and try again."})
        return
    res = post(url, api_key, "{}")
    status = res["status"]
    if status == 0:
        out({"result": "unknown", "error": "Could not reach IntroDB: " + res["error"]})
    elif status in (401, 403):
        out({"result": "invalid", "error": error_text(res, "Invalid API key")})
    elif status in (400, 422, 429) or 200 <= status < 300:
        out({"result": "valid"})
    else:
        out({"result": "unknown", "error": "IntroDB returned HTTP %d" % status})


def main(argv):
    if len(argv) >= 2 and argv[0] == "pubkey":
        cmd_pubkey(argv[1])
    elif len(argv) >= 6 and argv[0] == "submit":
        cmd_submit(*argv[1:6])
    elif len(argv) >= 5 and argv[0] == "validate":
        cmd_validate(*argv[1:5])
    else:
        out({"status": 0, "error": "usage: pubkey STATE | submit STATE URL PAGE_PUB SEALED BODY"
                                   " | validate STATE URL PAGE_PUB SEALED"})


if __name__ == "__main__":
    main(sys.argv[1:])
