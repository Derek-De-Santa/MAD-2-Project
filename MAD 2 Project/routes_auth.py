from flask import Blueprint, abort, g, jsonify, session
from werkzeug.security import check_password_hash, generate_password_hash
from models import db, User
from helpers import (current_user, login_required, get_json, text,
                     check_contact, read_account_form)

auth_bp = Blueprint('auth', __name__, url_prefix='/api')


@auth_bp.route('/register', methods=['POST'])
def register():
    # Only trekkers can self-register. Staff are created by the admin and there is only one admin.
    name, email, password, contact = read_account_form(get_json())
    user = User(name=name, email=email, password_hash=generate_password_hash(password),
                contact_details=contact or None, role='user')
    db.session.add(user)
    db.session.commit()
    return jsonify(message='Registration successful! Please log in.'), 201


@auth_bp.route('/login', methods=['POST'])
def login():
    data = get_json()
    email = str(data.get('email') or '').strip().lower()
    password = str(data.get('password') or '')

    user = User.query.filter_by(email=email).first()
    if not user or not check_password_hash(user.password_hash, password):
        abort(401, 'Invalid email or password')
    if user.is_blacklisted:
        abort(403, 'Your account has been blacklisted by the admin')
    if not user.is_active:
        abort(403, 'Your account has been deactivated by the admin')

    session.clear()
    session['user_id'] = user.id
    return jsonify(user=user.to_dict())


@auth_bp.route('/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify(message='You have been logged out')


@auth_bp.route('/me')
def me():
    user = current_user()
    if user and (user.is_blacklisted or not user.is_active):
        user = None
    return jsonify(user=user.to_dict() if user else None)


@auth_bp.route('/me', methods=['PUT'])
@login_required()
def update_profile():
    data = get_json()
    user = g.user
    user.name = text(data, 'name')
    contact = text(data, 'contact_details', 15, required=False)
    check_contact(contact)
    user.contact_details = contact or None

    new_password = str(data.get('new_password') or '')
    if new_password:
        if len(new_password) < 6:
            abort(400, 'New password must be at least 6 characters')
        user.password_hash = generate_password_hash(new_password)

    db.session.commit()
    return jsonify(message='Profile updated', user=user.to_dict())
