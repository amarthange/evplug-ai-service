import redis.asyncio as redis
import json
import os
from typing import Optional, Any

class RedisCache:
    def __init__(self, host: str = "localhost", port: int = 6379, db: int = 0):
        self.redis: Optional[redis.Redis] = None
        self.host = os.getenv("REDIS_HOST", host)
        self.port = int(os.getenv("REDIS_PORT", port))
        self.db = int(os.getenv("REDIS_DB", db))

    async def connect(self):
        if not self.redis:
            self.redis = redis.Redis(
                host=self.host,
                port=self.port,
                db=self.db,
                decode_responses=True
            )

    async def disconnect(self):
        if self.redis:
            await self.redis.close()
            self.redis = None

    async def get_json(self, key: str) -> Optional[Any]:
        if not self.redis:
            await self.connect()
        try:
            data = await self.redis.get(key)
            return json.loads(data) if data else None
        except Exception as e:
            print(f"Redis get_json error: {e}")
            return None

    async def set_json(self, key: str, value: Any, ttl: int = 300):
        if not self.redis:
            await self.connect()
        try:
            await self.redis.set(key, json.dumps(value), ex=ttl)
        except Exception as e:
            print(f"Redis set_json error: {e}")

    async def get_float(self, key: str) -> Optional[float]:
        if not self.redis:
            await self.connect()
        try:
            data = await self.redis.get(key)
            return float(data) if data else None
        except Exception as e:
            print(f"Redis get_float error: {e}")
            return None

    async def set_float(self, key: str, value: float, ttl: int = 300):
        if not self.redis:
            await self.connect()
        try:
            await self.redis.set(key, value, ex=ttl)
        except Exception as e:
            print(f"Redis set_float error: {e}")

# Global instance
cache = RedisCache()
