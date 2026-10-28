from datetime import datetime
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

DIFFICULTIES = ['Easy', 'Moderate', 'Hard']
TREK_STATUSES = ['Pending', 'Approved', 'Open', 'Closed', 'Completed']
BOOKING_STATUSES = ['Booked', 'Cancelled', 'Completed']


class User(db.Model):
    """One table for all roles: admin, staff and user (trekker).
    For staff, this row is also their Staff Profile (name, contact, assigned treks, status)."""
    __tablename__ = 'user'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    contact_details = db.Column(db.String(20))
    role = db.Column(db.String(20), nullable=False, default='user')  # admin / staff / user
    is_active = db.Column(db.Boolean, default=True)                  # False = deactivated
    is_blacklisted = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.now)

    def to_dict(self):
        data = {
            'id': self.id,
            'name': self.name,
            'email': self.email,
            'contact_details': self.contact_details,
            'role': self.role,
            'is_active': self.is_active,
            'is_blacklisted': self.is_blacklisted,
        }
        if self.role == 'staff':
            data['assigned_treks'] = [t.name for t in self.assigned_treks]
        return data


class Trek(db.Model):
    __tablename__ = 'trek'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    location = db.Column(db.String(150), nullable=False)
    difficulty = db.Column(db.String(50), nullable=False)       # Easy / Moderate / Hard
    duration_days = db.Column(db.Integer, nullable=False)
    description = db.Column(db.Text)
    instructions = db.Column(db.Text)                           # shown in reminder messages
    total_slots = db.Column(db.Integer, nullable=False)
    available_slots = db.Column(db.Integer, nullable=False)
    status = db.Column(db.String(50), default='Pending')        # Pending / Approved / Open / Closed / Completed
    is_started = db.Column(db.Boolean, default=False)           # staff marks the trek as started
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)
    staff_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)

    staff = db.relationship('User', backref='assigned_treks')

    @property
    def registered_count(self):
        # users who hold a booking (Booked or Completed) for this trek
        return len([b for b in self.bookings if b.status != 'Cancelled'])

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'location': self.location,
            'difficulty': self.difficulty,
            'duration_days': self.duration_days,
            'description': self.description,
            'instructions': self.instructions,
            'total_slots': self.total_slots,
            'available_slots': self.available_slots,
            'status': self.status,
            'is_started': self.is_started,
            'start_date': self.start_date.isoformat(),
            'end_date': self.end_date.isoformat(),
            'staff_id': self.staff_id,
            'staff_name': self.staff.name if self.staff else None,
            'registered_count': self.registered_count,
        }


class Booking(db.Model):
    __tablename__ = 'booking'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    trek_id = db.Column(db.Integer, db.ForeignKey('trek.id'), nullable=False)
    booking_date = db.Column(db.DateTime, default=datetime.now)
    status = db.Column(db.String(50), default='Booked')         # Booked / Cancelled / Completed

    user = db.relationship('User', backref='bookings')
    trek = db.relationship('Trek', backref='bookings')

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'user_name': self.user.name,
            'user_email': self.user.email,
            'user_contact': self.user.contact_details,
            'trek_id': self.trek_id,
            'trek_name': self.trek.name,
            'location': self.trek.location,
            'trek_status': self.trek.status,
            'start_date': self.trek.start_date.isoformat(),
            'end_date': self.trek.end_date.isoformat(),
            'booking_date': self.booking_date.strftime('%Y-%m-%d %H:%M'),
            'status': self.status,
        }


class Notification(db.Model):
    """In-app alerts: booking confirmed/cancelled and 'your CSV export is ready'."""
    __tablename__ = 'notification'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    message = db.Column(db.String(300), nullable=False)
    filename = db.Column(db.String(200))                        # set only for CSV export alerts
    is_read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.now)

    def to_dict(self):
        return {
            'id': self.id,
            'message': self.message,
            'filename': self.filename,
            'is_read': self.is_read,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M'),
        }
