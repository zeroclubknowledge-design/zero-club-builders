import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { BriefcaseBusiness, Star } from "@/components/icons/glyphs";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { addPostToPortfolio, fetchMyPortfolioPostIds, removePostFromPortfolio } from "./api";

/**
 * The post-menu entry that puts a post on the owner's portfolio.
 *
 * A shipped project goes in as a Project ("Add to portfolio"); any other post
 * is a Highlight ("Highlight"). Only the author ever sees this item, and the
 * database refuses anyone else's post regardless (RLS on portfolio_items).
 * Club-only posts and quote posts are left out: they never show publicly.
 */
export const PORTFOLIO_POST_IDS_KEY = "my_portfolio_post_ids";

export function useMyPortfolioPostIds(profileId?: string | null) {
  return useQuery({
    queryKey: [PORTFOLIO_POST_IDS_KEY, profileId],
    enabled: Boolean(profileId),
    staleTime: 60_000,
    queryFn: () => fetchMyPortfolioPostIds(profileId!),
  });
}

export function canPutOnPortfolio(
  post: { author_id?: string | null; audience?: string | null; quoted_post_id?: string | null },
  currentUserId?: string | null,
) {
  return Boolean(currentUserId) && post.author_id === currentUserId && post.audience !== "club" && !post.quoted_post_id;
}

export function PortfolioMenuItem({
  postId,
  isShip,
  currentUserId,
}: {
  postId: string;
  isShip: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: ids = [] } = useMyPortfolioPostIds(currentUserId);
  const onPortfolio = ids.includes(postId);

  const label = isShip
    ? onPortfolio
      ? "Remove from portfolio"
      : "Add to portfolio"
    : onPortfolio
      ? "Remove highlight"
      : "Highlight";

  const toggle = async () => {
    const key = [PORTFOLIO_POST_IDS_KEY, currentUserId];
    // Flip at once; put it back if the save fails.
    queryClient.setQueryData<string[]>(key, (prev = []) =>
      onPortfolio ? prev.filter((id) => id !== postId) : [...prev, postId],
    );
    try {
      if (onPortfolio) {
        await removePostFromPortfolio(currentUserId, postId);
        toast.success(isShip ? "Removed from your portfolio" : "Highlight removed");
      } else {
        await addPostToPortfolio(currentUserId, { id: postId, is_build_post: isShip });
        toast.success(isShip ? "Added to your portfolio" : "Highlighted on your portfolio", {
          action: { label: "View", onClick: () => router.navigate({ to: "/app/portfolio" }) },
        });
      }
      void queryClient.invalidateQueries({ queryKey: ["public_portfolio"] });
      void queryClient.invalidateQueries({ queryKey: ["my_portfolio"] });
    } catch (error: any) {
      queryClient.setQueryData<string[]>(key, (prev = []) =>
        onPortfolio ? [...prev, postId] : prev.filter((id) => id !== postId),
      );
      toast.error(error?.message || "Could not update your portfolio");
    } finally {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };

  return (
    <DropdownMenuItem
      className="flex items-center gap-3 py-2.5 cursor-pointer"
      onClick={(e) => {
        e.stopPropagation();
        void toggle();
      }}
    >
      {isShip ? (
        <BriefcaseBusiness className="h-4 w-4" />
      ) : (
        <Star className={`h-4 w-4 ${onPortfolio ? "fill-current text-amber-500" : ""}`} />
      )}
      <span className="font-medium text-sm">{label}</span>
    </DropdownMenuItem>
  );
}
