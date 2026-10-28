from celery import Celery
from celery.schedules import crontab
import config

celery = Celery(
    'tma',
    broker=config.CELERY_BROKER_URL,
    backend=config.CELERY_RESULT_BACKEND,
    include=['tasks'],
)
celery.conf.timezone = config.TIMEZONE

# Scheduled jobs (run by "celery beat")
celery.conf.beat_schedule = {
    'daily-trek-reminders': {
        'task': 'tasks.send_daily_reminders',
        'schedule': crontab(hour=config.REMINDER_HOUR, minute=config.REMINDER_MINUTE),
    },
    'monthly-admin-report': {
        'task': 'tasks.send_monthly_report',
        'schedule': crontab(day_of_month=1, hour=7, minute=0),  # 1st of every month
    },
}
