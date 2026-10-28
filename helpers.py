import re
from functools import wraps
from flask import abort, g, request, session
from models import db, User, Notification

EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
CONTACT_RE = re.compile(r'^[0-9+]{7,15}$')


# ---------- Authentication (session based) ----------

def current_user():
    user_id = session.get('user_id')
    return db.session.get(User, user_id) if user_id else None


def login_required(*roles):
    """Use as @login_required() for any logged-in user, or @login_required('admin') for one role."""
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            user = current_user()
            if not user:
                abort(401, 'Please log in first')
            if user.is_blacklisted or not user.is_active:
                session.clear()
                abort(403, 'Your account has been disabled by the admin')
            if roles and user.role not in roles:
                abort(403, 'You do not have access to this page')
            g.user = user
            return f(*args, **kwargs)
        return wrapper
    return decorator


# ---------- Validation ----------

def get_json():
    return request.get_json(silent=True) or {}


def text(data, key, max_len=100, required=True):
    value = str(data.get(key) or '').strip()
    label = key.replace('_', ' ').capitalize()
    if required and not value:
        abort(400, f'{label} is required')
    if len(value) > max_len:
        abort(400, f'{label} is too long (max {max_len} characters)')
    return value


def check_contact(contact):
    if contact and not CONTACT_RE.match(contact):
        abort(400, 'Contact number must be 7 to 15 digits')


def read_account_form(data):
    """Validates the form used for user registration and for admin adding staff."""
    name = text(data, 'name')
    email = text(data, 'email', 120).lower()
    password = str(data.get('password') or '')
    contact = text(data, 'contact_details', 15, required=False)

    if not EMAIL_RE.match(email):
        abort(400, 'Please enter a valid email address')
    if len(password) < 6:
        abort(400, 'Password must be at least 6 characters')
    check_contact(contact)
    if User.query.filter_by(email=email).first():
        abort(409, 'This email is already registered')
    return name, email, password, contact


def get_or_404(model, item_id, label='Item'):
    item = db.session.get(model, item_id)
    if not item:
        abort(404, f'{label} not found')
    return item


# ---------- Shared booking logic ----------

def add_notification(user_id, message, filename=None):
    db.session.add(Notification(user_id=user_id, message=message, filename=filename))


def cancel_booking(booking, message):
    """Cancels a booking, gives the slot back and notifies the user (caller commits)."""
    trek = booking.trek
    booking.status = 'Cancelled'
    if trek.available_slots < trek.total_slots:
        trek.available_slots += 1
    add_notification(booking.user_id, message)


def finish_trek(trek):
    """Marks a trek and all its active bookings as Completed (caller commits)."""
    trek.status = 'Completed'
    trek.is_started = True
    for booking in trek.bookings:
        if booking.status == 'Booked':
            booking.status = 'Completed'
