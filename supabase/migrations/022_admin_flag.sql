ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

UPDATE profiles SET is_admin = true WHERE username = 'selimfedakar';
