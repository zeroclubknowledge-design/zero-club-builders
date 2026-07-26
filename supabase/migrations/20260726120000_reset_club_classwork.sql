-- Give every club a clean classwork room. Replies and reactions are removed
-- through their existing cascade relationships.
delete from public.club_messages
where room_id = 'assignments';
