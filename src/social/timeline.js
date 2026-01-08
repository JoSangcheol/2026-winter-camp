import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "../firebase/firebase";

/**
 * 팔로우한 사람 글만 가져오기 (Query 방식)
 */
export async function fetchFollowingTimelineOnce(myUid) {
  // 1) 내가 팔로우한 uid 목록
  const followingCol = collection(db, "users", myUid, "following");
  const followingSnap = await getDocs(followingCol);

  const followingUids = followingSnap.docs.map((d) => d.id);

  if (followingUids.length === 0) return [];

  // 2) posts에서 팔로우한 사람 글만 조회
  const postsQ = query(
    collection(db, "posts"),
    where("uid", "in", followingUids.slice(0, 10)), // 수업 단계 제한
    orderBy("createdAt", "desc"),
    limit(30)
  );

  const postsSnap = await getDocs(postsQ);
  return postsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
