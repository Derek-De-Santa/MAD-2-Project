"""Redis cache helpers. If Redis is not running the app still works - it simply reads from the database."""
import json
import redis
import config

_client = redis.Redis.from_url(
    config.CACHE_URL, decode_responses=True,
    socket_connect_timeout=0.5, socket_timeout=0.5,
)


def cache_get(key):
    try:
        value = _client.get(key)
        return json.loads(value) if value is not None else None
    except redis.RedisError:
        return None


def cache_set(key, value, ttl=config.CACHE_TTL_SECONDS):
    try:
        _client.setex(key, ttl, json.dumps(value))  # the key expires automatically after ttl seconds
    except redis.RedisError:
        pass


def cache_clear(prefix):
    """Delete every cached key that starts with prefix (used when treks or slots change)."""
    try:
        for key in _client.scan_iter(prefix + '*'):
            _client.delete(key)
    except redis.RedisError:
        pass
