"""Helpers for sending email and Google Chat messages. Failures are printed, never raised."""
import json
import smtplib
import urllib.request
from email.message import EmailMessage
import config


def send_email(to, subject, html):
    msg = EmailMessage()
    msg['From'] = config.MAIL_FROM
    msg['To'] = to
    msg['Subject'] = subject
    msg.set_content('Please open this email in an HTML-capable mail client.')
    msg.add_alternative(html, subtype='html')
    try:
        with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=10) as server:
            if config.SMTP_USER:
                server.starttls()
                server.login(config.SMTP_USER, config.SMTP_PASSWORD)
            server.send_message(msg)
        print(f'[email sent] to={to} subject={subject}')
    except Exception as error:
        print(f'[email NOT sent: {error}] to={to} subject={subject}')


def send_gchat(message):
    if not config.GCHAT_WEBHOOK_URL:
        print(f'[gchat webhook not configured] {message}')
        return
    request = urllib.request.Request(
        config.GCHAT_WEBHOOK_URL,
        data=json.dumps({'text': message}).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
    )
    try:
        urllib.request.urlopen(request, timeout=10)
        print('[gchat sent]', message)
    except Exception as error:
        print(f'[gchat NOT sent: {error}]', message)
