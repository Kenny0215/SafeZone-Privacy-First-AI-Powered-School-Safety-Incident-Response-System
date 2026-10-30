from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from html import escape

import requests

log = logging.getLogger("safezone.telegram")

SGT = timezone(timedelta(hours=8))   # shown on the message; change if the school is elsewhere
TIMEOUT_S = (10, 15)   # (connect, read) seconds. Runs in the background, so patience is free.
ATTEMPTS = 2           # one retry: a first connection to Telegram can be slow or drop on some networks


def _cfg(name: str) -> str:
    """Read a setting from app.config.settings (which loads .env), else from the process environment
    (Hugging Face secrets). Example: _cfg("TELEGRAM_BOT_TOKEN") reads settings.telegram_bot_token."""
    try:
        from app.config import settings
        value = getattr(settings, name.lower(), "")
        if value:
            return str(value).strip()
    except Exception:
        pass
    return os.environ.get(name, "").strip()


def telegram_configured() -> bool:
    return bool(_cfg("TELEGRAM_BOT_TOKEN") and _cfg("TELEGRAM_CHAT_ID"))


def build_alert_text(zone_name: str, severity: str, reason: str, incident_id: str | int,
                     when: datetime | None = None, escalation: bool = False) -> str:
    when = (when or datetime.now(timezone.utc)).astimezone(SGT)
    head = "ESCALATION: nobody has acknowledged yet" if escalation else "SAFEZONE ALERT"
    lines = [
        f"<b>{escape(head)}</b>",
        f"Severity: <b>{escape(severity.upper())}</b>",
        f"Place: {escape(zone_name)}",
        f"Time: {when:%Y-%m-%d %H:%M:%S} (UTC+8)",
        f"Reason: {escape(reason)}",
        f"Incident: {escape(str(incident_id))}",
    ]
    dashboard = _cfg("DASHBOARD_URL")
    if dashboard:
        lines.append(f"Review: {escape(dashboard)}")
    lines.append("Please go to the location and acknowledge it in the dashboard.")
    return "\n".join(lines)


def send_telegram_alert(zone_name: str, severity: str, reason: str, incident_id: str | int,
                        when: datetime | None = None, escalation: bool = False) -> bool:
    """Best effort. Returns True only if Telegram accepted the message. Never raises, so a Telegram
    outage can never stop an incident from being saved."""
    token = _cfg("TELEGRAM_BOT_TOKEN")
    chat_id = _cfg("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        log.info("Telegram not configured; alert for incident %s not sent", incident_id)
        return False
    text = build_alert_text(zone_name, severity, reason, incident_id, when, escalation)
    last_error = ""
    for attempt in range(1, ATTEMPTS + 1):
        try:
            resp = requests.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": chat_id, "text": text, "parse_mode": "HTML", "disable_web_page_preview": True},
                timeout=TIMEOUT_S,
            )
            if not resp.ok:
                # Log the status only: the URL contains the token, so never log it. A rejection (bad token,
                # wrong chat id) will not get better by retrying.
                log.warning("Telegram rejected the alert (HTTP %s): %s", resp.status_code, resp.text[:200])
                return False
            return True
        except requests.RequestException as exc:
            last_error = type(exc).__name__
            log.warning("Telegram request failed (attempt %s/%s): %s", attempt, ATTEMPTS, last_error)
    print(f"[telegram] could not reach api.telegram.org after {ATTEMPTS} attempts ({last_error}). "
          f"Check this computer's internet / VPN / firewall.")
    return False