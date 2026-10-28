import csv
from datetime import date, datetime, time, timedelta
from html import escape

from flask import Flask

import config
from celery_app import celery
from models import db, User, Trek, Booking
from helpers import add_notification
from notify import send_email, send_gchat


# The worker runs in its own process, so it gets its own small Flask app just to reach the database.
# (It does not import app.py, which avoids circular imports.)
flask_app = Flask(__name__)
flask_app.config['SQLALCHEMY_DATABASE_URI'] = config.DATABASE_URI
db.init_app(flask_app)


# ---------- a. Scheduled job: daily reminders ----------

@celery.task
def send_daily_reminders():
    with flask_app.app_context():
        today = date.today()
        last_day = today + timedelta(days=config.REMINDER_DAYS)
        bookings = (Booking.query
                    .join(Trek, Booking.trek_id == Trek.id)
                    .filter(Booking.status == 'Booked',
                            Trek.start_date >= today,
                            Trek.start_date <= last_day)
                    .all())

        for booking in bookings:
            trek, user = booking.trek, booking.user
            days_left = (trek.start_date - today).days
            when = 'today' if days_left == 0 else f'in {days_left} day(s)'
            message = (f'Hi {user.name}, your trek "{trek.name}" at {trek.location} starts on '
                       f'{trek.start_date.strftime("%d %b %Y")} ({when}). '
                       f'Instructions: {trek.instructions or "Carry water, a jacket and your ID."}')

            send_gchat(message)
            send_email(user.email, f'Reminder: {trek.name} starts {when}',
                       f'<h3>Trek reminder</h3><p>{escape(message)}</p>')

        return f'{len(bookings)} reminder(s) processed'


# ---------- b. Scheduled job: monthly activity report for the admin ----------

@celery.task
def send_monthly_report():
    with flask_app.app_context():
        # The report covers the previous calendar month
        this_month_start = date.today().replace(day=1)
        last_month_end = this_month_start - timedelta(days=1)
        last_month_start = last_month_end.replace(day=1)

        conducted = Trek.query.filter(Trek.status == 'Completed',
                                      Trek.end_date >= last_month_start,
                                      Trek.end_date <= last_month_end).all()
        participants = {b.user_id for t in conducted for b in t.bookings if b.status == 'Completed'}

        count = db.func.count(Booking.id)
        popular = (db.session.query(Trek.name, count)
                   .join(Booking, Booking.trek_id == Trek.id)
                   .filter(Booking.status != 'Cancelled',
                           Booking.booking_date >= datetime.combine(last_month_start, time.min),
                           Booking.booking_date < datetime.combine(this_month_start, time.min))
                   .group_by(Trek.id, Trek.name)
                   .order_by(count.desc())
                   .limit(5).all())

        rows = ''.join(f'<tr><td>{escape(name)}</td><td>{total}</td></tr>' for name, total in popular)
        if not rows:
            rows = '<tr><td colspan="2">No bookings this month</td></tr>'

        month_name = last_month_start.strftime('%B %Y')
        html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2>Monthly Trekking Activity Report - {month_name}</h2>
          <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse;">
            <tr><td>Treks conducted</td><td><b>{len(conducted)}</b></td></tr>
            <tr><td>Users participated</td><td><b>{len(participants)}</b></td></tr>
          </table>
          <h3>Popular treks</h3>
          <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse;">
            <tr><th>Trek</th><th>Bookings</th></tr>
            {rows}
          </table>
        </div>"""

        admin = User.query.filter_by(role='admin').first()
        send_email(admin.email, f'Monthly Trekking Report - {month_name}', html)
        return f'Report for {month_name} generated for {admin.email}'


# ---------- c. User triggered job: export booking history as CSV ----------

@celery.task
def export_bookings_csv(user_id):
    with flask_app.app_context():
        bookings = (Booking.query.filter_by(user_id=user_id)
                    .order_by(Booking.booking_date.desc()).all())

        config.EXPORT_DIR.mkdir(exist_ok=True)
        filename = f'bookings_user{user_id}_{datetime.now().strftime("%Y%m%d%H%M%S")}.csv'

        with open(config.EXPORT_DIR / filename, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['User ID', 'Trek Name', 'Location', 'Booking Status',
                             'Booking Date', 'Trek Start Date', 'Trek End Date'])
            for b in bookings:
                writer.writerow([b.user_id, b.trek.name, b.trek.location, b.status,
                                 b.booking_date.strftime('%Y-%m-%d'),
                                 b.trek.start_date.isoformat(), b.trek.end_date.isoformat()])

        # The "alert once done": the user sees this notification with a download link
        add_notification(user_id, 'Your booking history CSV is ready to download.', filename)
        db.session.commit()
        return filename
