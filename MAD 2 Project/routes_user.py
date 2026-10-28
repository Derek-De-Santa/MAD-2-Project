from flask import Blueprint, abort, g, jsonify, request, send_from_directory
from models import db, Trek, Booking, Notification
from helpers import login_required, get_or_404, add_notification, cancel_booking
from cache import cache_get, cache_set, cache_clear
from tasks import export_bookings_csv
import config

user_bp = Blueprint('user', __name__, url_prefix='/api/user')


# ---------- Browse treks (cached in Redis) ----------

@user_bp.route('/treks')
@login_required('user')
def list_treks():
    difficulty = request.args.get('difficulty', '').strip()
    location = request.args.get('location', '').strip().lower()[:50]
    duration = request.args.get('duration', '').strip()

    key = f'treks:{difficulty}:{location}:{duration}'
    treks = cache_get(key)                      # 1. try the cache first
    if treks is None:                           # 2. cache miss -> read from the database
        query = Trek.query.filter(Trek.status.in_(['Approved', 'Open']))
        if difficulty:
            query = query.filter(Trek.difficulty == difficulty)
        if location:
            query = query.filter(Trek.location.ilike(f'%{location}%'))
        if duration.isdigit():
            query = query.filter(Trek.duration_days <= int(duration))   # "up to N days"
        treks = [t.to_dict() for t in query.order_by(Trek.start_date).all()]
        cache_set(key, treks)                   # 3. store for next time (expires after 60 seconds)
    return jsonify(treks=treks)


# ---------- Bookings ----------

@user_bp.route('/bookings')
@login_required('user')
def my_bookings():
    bookings = (Booking.query.filter_by(user_id=g.user.id)
                .order_by(Booking.booking_date.desc()).all())
    return jsonify(bookings=[b.to_dict() for b in bookings])


@user_bp.route('/bookings', methods=['POST'])
@login_required('user')
def book_trek():
    data = request.get_json(silent=True) or {}
    trek = get_or_404(Trek, data.get('trek_id'), 'Trek')

    if trek.status != 'Open':
        abort(400, 'This trek is not open for booking')

    already_booked = Booking.query.filter(Booking.user_id == g.user.id,
                                          Booking.trek_id == trek.id,
                                          Booking.status.in_(['Booked', 'Completed'])).first()
    if already_booked:
        abort(409, 'You have already booked this trek')

    # Take a slot only if one is still free. The check and the update happen in ONE
    # SQL statement, so two users can never grab the same last slot (no overbooking).
    updated = (Trek.query
               .filter(Trek.id == trek.id, Trek.status == 'Open', Trek.available_slots > 0)
               .update({'available_slots': Trek.available_slots - 1}, synchronize_session=False))
    if updated == 0:
        abort(409, 'Sorry, this trek is full')

    db.session.add(Booking(user_id=g.user.id, trek_id=trek.id, status='Booked'))
    add_notification(g.user.id, f'Booking confirmed for "{trek.name}".')
    db.session.commit()
    cache_clear('treks:')
    return jsonify(message=f'Successfully booked {trek.name}!'), 201


@user_bp.route('/bookings/<int:booking_id>/cancel', methods=['POST'])
@login_required('user')
def cancel_my_booking(booking_id):
    booking = get_or_404(Booking, booking_id, 'Booking')
    if booking.user_id != g.user.id:
        abort(403, 'This is not your booking')
    if booking.status != 'Booked' or booking.trek.is_started:
        abort(400, 'This booking can no longer be cancelled')

    cancel_booking(booking, f'Your booking for "{booking.trek.name}" has been cancelled.')
    db.session.commit()
    cache_clear('treks:')
    return jsonify(message='Booking cancelled')


# ---------- Export booking history (Celery job) ----------

@user_bp.route('/export', methods=['POST'])
@login_required('user')
def export_history():
    try:
        export_bookings_csv.apply_async(args=[g.user.id], retry=False)
    except Exception:
        abort(503, 'The background worker (Redis / Celery) is not running')
    return jsonify(message='Export started. You will get a notification when your CSV is ready.')


@user_bp.route('/exports/<filename>')
@login_required('user')
def download_export(filename):
    if not filename.startswith(f'bookings_user{g.user.id}_'):
        abort(403, 'This file does not belong to you')
    return send_from_directory(config.EXPORT_DIR, filename, as_attachment=True)


# ---------- Notifications ----------

@user_bp.route('/notifications')
@login_required('user')
def notifications():
    items = (Notification.query.filter_by(user_id=g.user.id)
             .order_by(Notification.id.desc()).limit(20).all())
    return jsonify(notifications=[n.to_dict() for n in items])


@user_bp.route('/notifications/read', methods=['POST'])
@login_required('user')
def mark_notifications_read():
    Notification.query.filter_by(user_id=g.user.id, is_read=False).update({'is_read': True})
    db.session.commit()
    return jsonify(message='Notifications marked as read')
