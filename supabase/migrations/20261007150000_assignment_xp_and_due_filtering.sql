-- Migration: Add RPC helper to award assignment XP to learners
CREATE OR REPLACE FUNCTION public.award_assignment_xp(p_user_id UUID, p_xp INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_user_id IS NULL OR p_xp IS NULL OR p_xp <= 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_params');
  END IF;

  UPDATE public.profiles
  SET xp = COALESCE(xp, 0) + p_xp
  WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true, 'xp_awarded', p_xp);
END;
$$;

REVOKE ALL ON FUNCTION public.award_assignment_xp(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_assignment_xp(UUID, INTEGER) TO authenticated;
