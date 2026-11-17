-- Jacki (جاكي) Enterprise Database Schema (Zero Fake Data)
CREATE TABLE users (
    user_id VARCHAR(50) PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    contact_type VARCHAR(10) NOT NULL,
    contact_value VARCHAR(120) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(30) DEFAULT 'user',
    agency_id VARCHAR(50) DEFAULT NULL,
    live_unlocked BOOLEAN DEFAULT 0,
    is_verified BOOLEAN DEFAULT 0,
    verification_badge VARCHAR(20) DEFAULT NULL,
    vip_level INTEGER DEFAULT 0,
    total_spent REAL DEFAULT 0.0,
    total_earned REAL DEFAULT 0.0,
    wallet_balance REAL DEFAULT 0.0,
    followers_count INTEGER DEFAULT 0,
    following_count INTEGER DEFAULT 0,
    hide_following BOOLEAN DEFAULT 0,
    lock_messages BOOLEAN DEFAULT 0,
    is_private BOOLEAN DEFAULT 0,
    active_frame VARCHAR(50) DEFAULT NULL,
    active_bubble VARCHAR(50) DEFAULT NULL,
    bio TEXT,
    banned BOOLEAN DEFAULT 0,
    ban_reason TEXT DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (user_id, username, display_name, contact_type, contact_value, password_hash, role, live_unlocked, is_verified, verification_badge, vip_level, bio)
VALUES ('1', '@admin', 'Jacki Official Developer', 'email', 'admin', 'adminkastlo', 'developer', 1, 1, 'gold', 15, 'Official Developer & Founder of Jacki');
