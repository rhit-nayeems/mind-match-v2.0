from flask import Flask
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import logging, os

def create_app():
    app = Flask(__name__)
    app.config.update({
        "SENTRY_DSN": os.getenv("SENTRY_DSN"),
        "RATELIMIT_DEFAULT": os.getenv("RATELIMIT_DEFAULT", "120 per minute"),
        "CORS_ALLOW_ORIGINS": os.getenv("CORS_ALLOW_ORIGINS", "*"),
        "EMBED_PROVIDER": os.getenv("EMBED_PROVIDER", "tfidf"),  # 'openai' or 'tfidf'
        "OPENAI_API_KEY": os.getenv("OPENAI_API_KEY"),
        "EMBED_MODEL": os.getenv("EMBED_MODEL", "text-embedding-3-small"),
        "DB_URL": os.getenv("DB_URL", "sqlite:///bandit.db"),
        "TMDB_BEARER": os.getenv("TMDB_BEARER"),
        "TMDB_API_KEY": os.getenv("TMDB_API_KEY"),
        "TMDB_REGION": os.getenv("TMDB_REGION", "US"),
    })

    logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(levelname)s: %(message)s')
    CORS(app, resources={r"/*": {"origins": app.config["CORS_ALLOW_ORIGINS"]}})
    Limiter(get_remote_address, app=app, default_limits=[app.config["RATELIMIT_DEFAULT"]])

    try:
        import sentry_sdk
        if app.config["SENTRY_DSN"]:
            sentry_sdk.init(dsn=app.config["SENTRY_DSN"], traces_sample_rate=0.1)
    except Exception:
        pass

    from .main import bp as main_bp, init_app as _init_app
    app.register_blueprint(main_bp)
    _init_app(app)

    return app
