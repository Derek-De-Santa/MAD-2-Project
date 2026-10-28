from datetime import date
from flask import Blueprint, abort, jsonify, request
from werkzeug.security import generate_password_hash
from models import db, User, Trek, Booking, DIFFICULTIES, TREK_STATUSES, BOOKING_STATUSES
from helpers import login_required, get_json, text, read_account_form, get_or_404, finish_trek
from cache import cache_clear

admin_bp = Blueprint('admin', __name__, url_prefix='/api/admin')


# ---------- Dashboard statistics ----------

@admin_bp.route('/stats')
@login_required('admin')
def stats():
    count = db.func.count(Booking.id)
    popular = (db.session.query(Trek.name, count)
               .join(Booking, Booking.trek_id == Trek.id)
               .filter(Booking.status != 'Cancelled')
               .group_by(Trek.id, Trek.name)
               .order_by(count.desc())
               .limit(5).all())

    return jsonify(
        total_treks=Trek.query.count(),
        total_users=User.query.filter_by(role='user').count(),
        total_staff=User.query.filter_by(role='staff').count(),
        total_bookings=Booking.query.count(),
        bookings_by_status={s: Booking.query.filter_by(status=s).count() for s in BOOKING_STATUSES},
        popular_treks=[{'name': name, 'bookings': total} for name, total in popular],
    )


# ---------- Treks ----------

def read_trek_form(data):
    """Validates trek form data and returns the fields as a dict."""
    difficulty = data.get('difficulty')
    if difficulty not in DIFFICULTIES:
        abort(400, 'Difficulty must be Easy, Moderate or Hard')

    try:
        total_slots = int(data.get('total_slots'))
    except (TypeError, ValueError):
        abort(400, 'Total slots must be a number')
    if total_slots < 1:
        abort(400, 'Total slots must be at least 1')

    try:
        start_date = date.fromisoformat(str(data.get('start_date')))
        end_date = date.fromisoformat(str(data.get('end_date')))
    except ValueError:
        abort(400, 'Please enter valid start and end dates')
    if end_date < start_date:
        abort(400, 'End date cannot be before the start date')

    return {
        'name': text(data, 'name', 150),
        'location': text(data, 'location', 150),
        'difficulty': difficulty,
        'total_slots': total_slots,
        'start_date': start_date,
        'end_date': end_date,
        'duration_days': (end_date - start_date).days + 1,   # calculated, so it can never be inconsistent
        'description': text(data, 'description', 1000, required=False),
        'instructions': text(data, 'instructions', 1000, required=False),
    }


def find_staff(staff_id):
    try:
        staff = db.session.get(User, int(staff_id))
    except (TypeError, ValueError):
        staff = None
    if not staff or staff.role != 'staff':
        abort(400, 'Please choose a valid staff member')
    if staff.is_blacklisted or not staff.is_active:
        abort(400, 'That staff member is deactivated or blacklisted')
    return staff


@admin_bp.route('/treks')
@login_required('admin')
def list_treks():
    q = request.args.get('q', '').strip()
    query = Trek.query
    if q:
        like = f'%{q}%'
        query = query.filter(db.or_(Trek.name.ilike(like), Trek.location.ilike(like)))
    return jsonify(treks=[t.to_dict() for t in query.order_by(Trek.start_date.desc()).all()])


@admin_bp.route('/treks', methods=['POST'])
@login_required('admin')
def create_trek():
    data = get_json()
    trek = Trek(**read_trek_form(data), status='Pending')
    trek.available_slots = trek.total_slots

    if data.get('staff_id'):
        trek.staff_id = find_staff(data['staff_id']).id
        trek.status = 'Approved'          # a trek with staff assigned is approved

    db.session.add(trek)
    db.session.commit()
    cache_clear('treks:')
    return jsonify(message='Trek created'), 201


@admin_bp.route('/treks/<int:trek_id>', methods=['PUT'])
@login_required('admin')
def update_trek(trek_id):
    trek = get_or_404(Trek, trek_id, 'Trek')
    data = get_json()
    fields = read_trek_form(data)

    status = data.get('status', trek.status)
    if status not in TREK_STATUSES:
        abort(400, 'Invalid trek status')

    registered = trek.registered_count
    if fields['total_slots'] < registered:
        abort(400, f'{registered} users have already booked, so total slots cannot be lower than that')

    for key, value in fields.items():
        setattr(trek, key, value)
    trek.available_slots = trek.total_slots - registered
    trek.status = status
    if status == 'Completed':
        finish_trek(trek)

    db.session.commit()
    cache_clear('treks:')
    return jsonify(message='Trek updated')


@admin_bp.route('/treks/<int:trek_id>/assign', methods=['PUT'])
@login_required('admin')
def assign_staff(trek_id):
    trek = get_or_404(Trek, trek_id, 'Trek')
    staff = find_staff(get_json().get('staff_id'))
    trek.staff_id = staff.id
    if trek.status == 'Pending':
        trek.status = 'Approved'
    db.session.commit()
    cache_clear('treks:')
    return jsonify(message=f'{staff.name} assigned to {trek.name}')


@admin_bp.route('/treks/<int:trek_id>', methods=['DELETE'])
@login_required('admin')
def delete_trek(trek_id):
    trek = get_or_404(Trek, trek_id, 'Trek')
    if trek.bookings:
        # bookings are part of the trekking history, so we keep them
        abort(409, 'This trek has bookings and cannot be deleted. Set its status to Closed instead.')
    db.session.delete(trek)
    db.session.commit()
    cache_clear('treks:')
    return jsonify(message='Trek deleted')


# ---------- Users and staff ----------

@admin_bp.route('/users')
@login_required('admin')
def list_users():
    role = request.args.get('role', 'user')
    if role not in ('user', 'staff'):
        abort(400, 'Role must be user or staff')
    q = request.args.get('q', '').strip()

    query = User.query.filter_by(role=role)
    if q:
        like = f'%{q}%'
        query = query.filter(db.or_(User.name.ilike(like), User.email.ilike(like)))
    return jsonify(users=[u.to_dict() for u in query.order_by(User.name).all()])


@admin_bp.route('/staff', methods=['POST'])
@login_required('admin')
def add_staff():
    name, email, password, contact = read_account_form(get_json())
    staff = User(name=name, email=email, password_hash=generate_password_hash(password),
                 contact_details=contact or None, role='staff')
    db.session.add(staff)
    db.session.commit()
    return jsonify(message=f'Staff member {name} added'), 201


def get_manageable_user(user_id):
    user = get_or_404(User, user_id, 'User')
    if user.role == 'admin':
        abort(400, 'The admin account cannot be changed')
    return user


@admin_bp.route('/users/<int:user_id>/toggle_active', methods=['POST'])
@login_required('admin')
def toggle_active(user_id):
    user = get_manageable_user(user_id)
    user.is_active = not user.is_active
    db.session.commit()
    return jsonify(message=f'{user.name} {"activated" if user.is_active else "deactivated"}')


@admin_bp.route('/users/<int:user_id>/toggle_blacklist', methods=['POST'])
@login_required('admin')
def toggle_blacklist(user_id):
    user = get_manageable_user(user_id)
    user.is_blacklisted = not user.is_blacklisted
    db.session.commit()
    return jsonify(message=f'{user.name} {"blacklisted" if user.is_blacklisted else "removed from blacklist"}')


# ---------- All bookings (complete history) ----------

@admin_bp.route('/bookings')
@login_required('admin')
def all_bookings():
    q = request.args.get('q', '').strip()
    status = request.args.get('status', '').strip()

    query = (Booking.query
             .join(User, Booking.user_id == User.id)
             .join(Trek, Booking.trek_id == Trek.id))
    if q:
        like = f'%{q}%'
        query = query.filter(db.or_(User.name.ilike(like), User.email.ilike(like), Trek.name.ilike(like)))
    if status:
        query = query.filter(Booking.status == status)
    return jsonify(bookings=[b.to_dict() for b in query.order_by(Booking.booking_date.desc()).all()])
