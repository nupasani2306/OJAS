-- OJAS: columns and policies the app needs that the first schema did not have.
-- Apply once: Supabase dashboard -> SQL Editor -> paste this file -> Run
-- (or `supabase db push` with the Supabase CLI). Safe to run more than once.

-- 1. Settings shown in the app ------------------------------------------------
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS emergency_message   text,
  ADD COLUMN IF NOT EXISTS sos_message         text,
  ADD COLUMN IF NOT EXISTS weekly_workout_goal integer NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS qr_include_contacts boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'emergency_message_length') THEN
    ALTER TABLE public.user_settings
      ADD CONSTRAINT emergency_message_length CHECK (emergency_message IS NULL OR char_length(emergency_message) <= 300),
      ADD CONSTRAINT sos_message_length       CHECK (sos_message IS NULL OR char_length(sos_message) <= 300),
      ADD CONSTRAINT weekly_workout_goal_range CHECK (weekly_workout_goal BETWEEN 1 AND 14);
  END IF;
END $$;

-- 2. Delete policies that were missing ----------------------------------------
-- "Clear chat" in the app
DROP POLICY IF EXISTS "Users can delete own chat" ON public.chat_messages;
CREATE POLICY "Users can delete own chat" ON public.chat_messages
  FOR DELETE USING (auth.uid() = user_id);

-- Deleting a sleep session
DROP POLICY IF EXISTS "Users can delete own sleep sessions" ON public.sleep_sessions;
CREATE POLICY "Users can delete own sleep sessions" ON public.sleep_sessions
  FOR DELETE USING (auth.uid() = user_id);
