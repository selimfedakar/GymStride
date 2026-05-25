-- Allow requesters to cancel (delete) their own pending chat requests.
-- Without this policy, RLS blocks the DELETE and returns a 403.

CREATE POLICY "chat_requests: requester can cancel"
  ON public.chat_requests FOR DELETE
  TO authenticated
  USING (requester_id = auth.uid() AND status = 'pending');
