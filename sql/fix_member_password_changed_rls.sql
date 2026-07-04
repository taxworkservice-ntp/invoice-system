-- Allow staff members to update their own password_changed flag
-- Run this in Supabase SQL Editor
DROP POLICY IF EXISTS "Members update own password_changed" ON public.client_members;
CREATE POLICY "Members update own password_changed"
  ON public.client_members FOR UPDATE
  USING (member_user_id = auth.uid())
  WITH CHECK (member_user_id = auth.uid());
