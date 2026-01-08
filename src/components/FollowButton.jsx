import { useEffect, useState } from "react";
import { followToggle, isFollowingOnce } from "../social/follow";
import { useAuth } from "../auth/useAuth";

export default function FollowButton({ targetUid }) {
  const { user } = useAuth();
  const myUid = user?.uid;

  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      if (!myUid || !targetUid || myUid === targetUid) {
        setIsFollowing(false);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const yes = await isFollowingOnce(myUid, targetUid);
        if (alive) setIsFollowing(yes);
      } finally {
        if (alive) setLoading(false);
      }
    };

    run();
    return () => {
      alive = false;
    };
  }, [myUid, targetUid]);

  // 자기 자신은 팔로우 버튼 비활성/숨김 처리
  if (!myUid || !targetUid || myUid === targetUid) return null;

  const handleClick = async () => {
    try {
      setWorking(true);
      // UX 즉시 반영(옵션): 클릭 순간 토글 표시
      setIsFollowing((prev) => !prev);

      const res = await followToggle(myUid, targetUid);
      setIsFollowing(res.isFollowing);
    } catch (e) {
      // 실패하면 원복(단순 처리)
      setIsFollowing((prev) => !prev);
      alert(e?.message ?? "팔로우 처리 중 오류가 발생했습니다.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      variant={isFollowing ? "secondary" : "primary"}
      disabled={loading || working}
      className='whitespace-nowrap w-auto px-3 py-1'
    >
      {loading ? "확인 중..." : isFollowing ? "언팔로우" : "팔로우"}
    </button>
  );
}
