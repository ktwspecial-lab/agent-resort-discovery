declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ADMIN_TOKEN: string;
    ANALYTICS_SALT: string;
    API_RATE_LIMITER: RateLimit;
  }
}
