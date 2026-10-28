from flask import Blueprint, abort, g, jsonify
from models import db, Trek, Booking
from helpers import login_required, get_json, get_or_404, cancel_booking, finish_trek
from cache import cache_clear

staff_bp = Blueprint('staff', __name__, url_prefix='/api/staff')


def my_trek(trek_id):
    """Returns the trek only if it is assigned to the logged-in staff member."""
    trek = get_or_404(Trek, trek_id, 'Trek')
    if trek.staff_id != g.user.id:
        abort(403, 'You are not assigned to this trek')
    return trek


@staff_bp.route('/treks')
@login_required('staff')
def my_treks():
    treks = Trek.query.filter_by(staff_id=g.user.id).order_by(Trek.start_date).all()
    return jsonify(treks=[t.to_dict() for t in treks])


@staff_bp.route('/treks/<int:trek_id>', methods=['PUT'])
@login_required('staff')
def update_trek(trek_id):
    """Staff can change available slots and set the status to Open / Closed."""
    trek = my_trek(trek_id)
    if trek.status == 'Completed' or trek.is_started:
        abort(400, 'This trek has already started or finished and can no longer be edited')

    data = get_json()

    status = data.get('status')
    if status:
        if status not in ('Open', 'Closed'):
            abort(400, 'Staff can only set a trek to Open or Closed')
        if trek.status == 'Pending':
            abort(400, 'This trek is still waiting for admin approval')
        trek.status = status

    if data.get('available_slots') not in (None, ''):
        try:
            slots = int(data['available_slots'])
        except (TypeError, ValueError):
            abort(400, 'Slots must be a number')
        if slots < 0 or slots > trek.total_slots:
            abort(400, f'Available slots must be between 0 and {trek.total_slots}')
        trek.available_slots = slots

    db.session.commit()
    cache_clear('treks:')
    return jsonify(message=f'"{trek.name}" updated')


@staff_bp.route('/treks/<int:trek_id>/start', methods=['POST'])
@login_required('staff')
def start_trek(trek_id):
    trek = my_trek(trek_id)
    if trek.is_started or trek.status in ('Pending', 'Completed'):
        abort(400, 'This trek cannot be started')
    trek.is_started = True
    trek.status = 'Closed'      # no more bookings once the trek has started
    db.session.commit()
    cache_clear('treks:')
    return jsonify(message=f'"{trek.name}" marked as started')


@staff_bp.route('/treks/<int:trek_id>/complete', methods=['POST'])
@login_required('staff')
def complete_trek(trek_id):
    trek = my_trek(trek_id)
    if not trek.is_started:
        abort(400, 'Start the trek before marking it completed')
    if trek.status == 'Completed':
        abort(400, 'This trek is already completed')
    finish_trek(trek)
    db.session.commit()
    cache_clear('treks:')
    return jsonify(message=f'"{trek.name}" marked as completed')


@staff_bp.route('/treks/<int:trek_id>/participants')
@login_required('staff')
def participants(trek_id):
    trek = my_trek(trek_id)
    bookings = sorted(trek.bookings, key=lambda b: b.booking_date)
    return jsonify(participants=[b.to_dict() for b in bookings])


@staff_bp.route('/bookings/<int:booking_id>/cancel', methods=['POST'])
@login_required('staff')
def cancel_participant(booking_id):
    booking = get_or_404(Booking, booking_id, 'Booking')
    trek = my_trek(booking.trek_id)
    if booking.status != 'Booked' or trek.is_started:
        abort(400, 'This booking can no longer be cancelled')
    cancel_booking(booking, f'Your booking for "{trek.name}" was cancelled by the trek staff.')
    db.session.commit()
    cache_clear('treks:')
    return jsonify(message='Participant removed from the trek')
