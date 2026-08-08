export type DirectorCardUpdateCandidate = {
  updatedAt: string | null | undefined;
  updatedBy: string | null | undefined;
};

export type DirectorCardUpdateMetadata = {
  updatedAt: string;
  updatedBy: string;
};

export function latestDirectorCardUpdate(
  ...candidates: Array<DirectorCardUpdateCandidate | null | undefined>
): DirectorCardUpdateMetadata | null {
  const latest = candidates
    .filter((candidate): candidate is DirectorCardUpdateCandidate => {
      if (!candidate?.updatedAt) {
        return false;
      }

      return Number.isFinite(new Date(candidate.updatedAt).getTime());
    })
    .sort(
      (left, right) =>
        new Date(right.updatedAt as string).getTime() -
        new Date(left.updatedAt as string).getTime()
    )[0];

  if (!latest?.updatedAt) {
    return null;
  }

  return {
    updatedAt: latest.updatedAt,
    updatedBy: latest.updatedBy?.trim() || "Unknown"
  };
}
