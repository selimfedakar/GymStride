-- Allows an authenticated user to delete their own account.
-- Deleting from auth.users CASCADE-removes everything in public schema as well.
CREATE OR REPLACE FUNCTION delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Public data removed via CASCADE on profiles.id → auth.users.id FK
  DELETE FROM public.profiles WHERE id = _uid;

  -- Remove the auth identity (requires postgres-role privilege on auth schema)
  DELETE FROM auth.users WHERE id = _uid;
END;
$$;

REVOKE EXECUTE ON FUNCTION delete_my_account() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION delete_my_account() TO authenticated;
