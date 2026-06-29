-- Create message_reactions for Private Messages
CREATE TABLE IF NOT EXISTS public.message_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(message_id, profile_id, emoji)
);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read message reactions"
    ON public.message_reactions FOR SELECT
    USING (true);

CREATE POLICY "Users can insert their own message reactions"
    ON public.message_reactions FOR INSERT
    WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Users can delete their own message reactions"
    ON public.message_reactions FOR DELETE
    USING (auth.uid() = profile_id);


-- Create club_message_reactions for Club Messages (if not exists or missing policies)
CREATE TABLE IF NOT EXISTS public.club_message_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID REFERENCES public.club_messages(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(message_id, profile_id, emoji)
);

ALTER TABLE public.club_message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read club message reactions"
    ON public.club_message_reactions FOR SELECT
    USING (true);

CREATE POLICY "Users can insert their own club message reactions"
    ON public.club_message_reactions FOR INSERT
    WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Users can delete their own club message reactions"
    ON public.club_message_reactions FOR DELETE
    USING (auth.uid() = profile_id);
