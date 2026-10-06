export type PublicationPayload = {
  content: string;
  media_urls: string[];
  project_root_id: string | null;
  version_label: string;
  release_notes: string | null;
  available_for_use: boolean;
  license_type: "standard" | "commercial" | "full_ownership";
  license_price: number;
  bootcamp_id: string | null;
  audience: "everyone" | "club";
  audience_club_id: string | null;
};

export type PublicationAttempt = {
  id: string;
  project_name: string;
  payload: PublicationPayload;
  target_id: string | null;
  expires_at: string;
  status: "pending" | "approved" | "denied" | "cancelled" | "published";
  post_id?: string | null;
};
