from flask import Flask, jsonify, render_template
from werkzeug.exceptions import HTTPException
from werkzeug.security import generate_password_hash

import config
from models import db, User

app = Flask(__name__)
app.config['SECRET_KEY'] = config.SECRET_KEY
app.config['SQLALCHEMY_DATABASE_URI'] = config.DATABASE_URI
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
db.init_app(app)

# --- API routes ---
from routes_auth import auth_bp
from routes_admin import admin_bp
from routes_staff import staff_bp
from routes_user import user_bp

for blueprint in (auth_bp, admin_bp, staff_bp, user_bp):
    app.register_blueprint(blueprint)


# --- The only HTML page: the entry point for the VueJS app ---
@app.route('/')
def index():
    return render_template('index.html')


# --- Every error is returned as JSON so the Vue frontend can show the message ---
@app.errorhandler(HTTPException)
def handle_http_error(error):
    return jsonify(error=error.description), error.code


def setup_database():
    """Creates the tables and the single admin account (no manual DB creation needed)."""
    with app.app_context():
        db.create_all()
        if not User.query.filter_by(role='admin').first():
            db.session.add(User(name=config.ADMIN_NAME, email=config.ADMIN_EMAIL,
                                password_hash=generate_password_hash(config.ADMIN_PASSWORD),
                                role='admin'))
            db.session.commit()
            print(f'Admin created -> {config.ADMIN_EMAIL}')


setup_database()

if __name__ == '__main__':
    app.run(debug=True)
