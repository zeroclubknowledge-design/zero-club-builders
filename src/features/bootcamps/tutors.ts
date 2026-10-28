type TutorAssignment = { assigned_tutor_id?: string | null; assigned_tutor_ids?: string[] | null };

export function assignedBootcampTutorIds(bootcamp?: TutorAssignment | null): string[] {
  return [...new Set([...(bootcamp?.assigned_tutor_ids || []), bootcamp?.assigned_tutor_id].filter((id): id is string => !!id))];
}

export function isAssignedBootcampTutor(bootcamp: TutorAssignment | null | undefined, profileId?: string | null): boolean {
  return !!profileId && assignedBootcampTutorIds(bootcamp).includes(profileId);
}
