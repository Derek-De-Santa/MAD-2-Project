# Trekking Management Application (TMA) - V2

Flask API + VueJS (CDN) + Bootstrap + SQLite + Redis cache + Celery batch jobs.

## Folder structure

```
trekking_v2/
├── app.py              # Flask app, error handling, creates tables + the single admin
├── config.py           # all settings (Redis, email, Google Chat webhook, timings)
├── models.py           # User, Trek, Booking, Notification
├── helpers.py          # login/role decorator, validation, shared booking logic
├── routes_auth.py      # register, login, logout, profile
├── routes_admin.py     # admin APIs
├── routes_staff.py     # staff APIs
├── routes_user.py      # trekker APIs (cached trek search, booking, CSV export)
├── cache.py            # Redis caching helpers (with expiry)
├── celery_app.py       # Celery + beat schedule
├── tasks.py            # daily reminders, monthly report, CSV export
├── notify.py           # send email / Google Chat message
├── templates/index.html        # ONLY Jinja2 file (entry point for Vue)
└── static/js/                  # VueJS components (api, auth, admin, staff, user, app)
```

## How to run (everything works on your local machine)

1. Install and start Redis (`redis-server`).
2. Install Python packages:
   ```
   pip install -r requirements.txt
   ```
3. **Terminal 1 - Flask app** (creates the database and the admin automatically):
   ```
   python app.py
   ```
   Open http://127.0.0.1:5000
4. **Terminal 2 - Celery worker** (needed for the CSV export):
   ```
   celery -A celery_app.celery worker --loglevel=info
   ```
   (On Windows add `--pool=solo`.)
5. **Terminal 3 - Celery beat** (needed for the scheduled jobs):
   ```
   celery -A celery_app.celery beat --loglevel=info
   ```

Start the Flask app first, because it creates the database tables the worker uses.

**Admin login:** `admin@treks.com` / `admin123` (change in `config.py`).
Staff accounts are created by the admin (Staff tab -> Add Staff). Trekkers register themselves.

## Typical demo flow

1. Admin logs in -> Staff tab -> add a staff member.
2. Admin -> Treks tab -> create a trek and assign the staff member (status becomes *Approved*).
3. Staff logs in -> sets the trek to *Open* and sets the slots.
4. Trekker registers, logs in, searches treks, books one. Booking stays blocked for full / non-open / duplicate.
5. Staff -> *Mark as Started* -> *Mark as Completed* (bookings become *Completed* = trekking history).
6. Trekker -> *Export Booking History (CSV)* -> a notification with a download link appears in a few seconds.

## Backend jobs (Celery)

| Job | Task | Schedule | Output |
|---|---|---|---|
| Daily reminders | `tasks.send_daily_reminders` | every day 08:00 | Email + Google Chat message for treks starting in the next 3 days |
| Monthly report | `tasks.send_monthly_report` | 1st of the month, 07:00 | HTML email to the admin (treks conducted, users participated, popular treks) |
| CSV export | `tasks.export_bookings_csv` | when the user clicks Export | CSV in `exports/` + in-app notification |

Test the scheduled jobs without waiting (worker must be running):
```
celery -A celery_app.celery call tasks.send_daily_reminders
celery -A celery_app.celery call tasks.send_monthly_report
```

**Email / Google Chat setup** (optional - if not configured the messages are printed in the worker console):
- Email: run MailHog (SMTP on port 1025, the default) or set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` environment variables.
- Google Chat: create an incoming webhook in a Chat space and set `GCHAT_WEBHOOK_URL`.

## Redis caching

The trek list for trekkers (`GET /api/user/treks`) is cached per search filter with a **60 second expiry**. The cache is cleared whenever a trek, its slots, or a booking changes. If Redis is down the app still works (it reads from the database).
Check it with: `redis-cli keys "treks:*"`

## Business rules implemented

- No overbooking: the slot is taken with a single atomic SQL update (`available_slots > 0`).
- Booking only when the trek status is *Open*; no duplicate active booking for the same trek.
- Only the assigned staff member can manage a trek (403 otherwise).
- Blacklisted / deactivated accounts are blocked at login and on every request.
- Only one admin (created in code); admin and staff cannot register; trekker registration always creates role `user`.
- Treks with bookings cannot be deleted (history is kept). Duration is calculated from the dates.

## API endpoints

| Method | URL | Who | Purpose |
|---|---|---|---|
| POST | /api/register | public | trekker registration |
| POST | /api/login, /api/logout | all | session login / logout |
| GET, PUT | /api/me | all | current user / update profile |
| GET | /api/admin/stats | admin | totals + chart data |
| GET, POST | /api/admin/treks | admin | search / create treks |
| PUT, DELETE | /api/admin/treks/<id> | admin | update / delete trek |
| PUT | /api/admin/treks/<id>/assign | admin | assign staff to trek |
| GET | /api/admin/users?role=user\|staff&q= | admin | list / search users or staff |
| POST | /api/admin/staff | admin | add trek staff |
| POST | /api/admin/users/<id>/toggle_active | admin | deactivate / activate |
| POST | /api/admin/users/<id>/toggle_blacklist | admin | blacklist / unblacklist |
| GET | /api/admin/bookings?q=&status= | admin | all bookings |
| GET | /api/staff/treks | staff | assigned treks with registered count |
| PUT | /api/staff/treks/<id> | staff | update slots and Open/Closed |
| POST | /api/staff/treks/<id>/start, /complete | staff | mark started / completed |
| GET | /api/staff/treks/<id>/participants | staff | participant list |
| POST | /api/staff/bookings/<id>/cancel | staff | remove a participant |
| GET | /api/user/treks?location=&difficulty=&duration= | user | search treks (cached) |
| GET, POST | /api/user/bookings | user | booking history / book a trek |
| POST | /api/user/bookings/<id>/cancel | user | cancel a booking |
| POST | /api/user/export | user | start CSV export job |
| GET | /api/user/exports/<file> | user | download own CSV |
| GET | /api/user/notifications, POST .../read | user | alerts |

## Database (ER summary)

- **User** (id, name, email, password_hash, contact_details, role, is_active, is_blacklisted, created_at) - one table for admin / staff / user. For staff this row is also the Staff Profile.
- **Trek** (id, name, location, difficulty, duration_days, description, instructions, total_slots, available_slots, status, is_started, start_date, end_date, **staff_id -> User**)
- **Booking** (id, **user_id -> User**, **trek_id -> Trek**, booking_date, status)
- **Notification** (id, **user_id -> User**, message, filename, is_read, created_at)

Relations: User 1-N Booking, Trek 1-N Booking, User(staff) 1-N Trek, User 1-N Notification.
