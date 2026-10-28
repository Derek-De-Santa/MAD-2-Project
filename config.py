import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

# --- Flask / Database ---
SECRET_KEY = os.environ.get('SECRET_KEY', 'change-this-secret-key')
DATABASE_URI = 'sqlite:///' + (BASE_DIR / 'trekking_v2.db').as_posix()

# --- The one and only admin (created programmatically on first run) ---
ADMIN_NAME = 'Super Admin'
ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL', 'admin@treks.com')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'admin123')

# --- Redis (cache = db 0, Celery broker = db 1, Celery results = db 2) ---
REDIS_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379')
CACHE_URL = REDIS_URL + '/0'
CELERY_BROKER_URL = REDIS_URL + '/1'
CELERY_RESULT_BACKEND = REDIS_URL + '/2'
CACHE_TTL_SECONDS = 60  # cached trek lists expire after 60 seconds

# --- Folder where exported CSV files are saved ---
EXPORT_DIR = BASE_DIR / 'exports'

# --- Email (default is a local MailHog server on port 1025) ---
# For Gmail use: SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, SMTP_USER=..., SMTP_PASSWORD=<app password>
SMTP_HOST = os.environ.get('SMTP_HOST', 'localhost')
SMTP_PORT = int(os.environ.get('SMTP_PORT', 1025))
SMTP_USER = os.environ.get('SMTP_USER', '')
SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD', '')
MAIL_FROM = os.environ.get('MAIL_FROM', 'trekmanager@example.com')

# --- Google Chat incoming webhook (leave empty to just print reminders in the console) ---
GCHAT_WEBHOOK_URL = os.environ.get('GCHAT_WEBHOOK_URL', '')

# --- Scheduled jobs ---
TIMEZONE = os.environ.get('TIMEZONE', 'Asia/Kolkata')
REMINDER_HOUR = 8        # daily reminders run at 08:00
REMINDER_MINUTE = 0
REMINDER_DAYS = 3        # remind about treks starting within the next 3 days
