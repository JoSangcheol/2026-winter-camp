// src/social/follow.js
import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/firebase";

/**
 * followToggle
 * - 이미 following 문서가 있으면: 언팔로우 (following 삭제 + followers 삭제)
 * - 없으면: 팔로우 (following 생성 + followers 생성)
 *
 * @param {string} myUid
 * @param {string} targetUid
 * @returns {Promise<{isFollowing: boolean}>}
 */
export async function followToggle(myUid, targetUid) {
  if (!myUid) throw new Error("myUid is required");
  if (!targetUid) throw new Error("targetUid is required");
  if (myUid === targetUid) throw new Error("cannot follow yourself");

  const followingRef = doc(db, "users", myUid, "following", targetUid);
  const followerRef = doc(db, "users", targetUid, "followers", myUid);

  const result = await runTransaction(db, async (tx) => {
    const followingSnap = await tx.get(followingRef);

    if (followingSnap.exists()) {
      // 언팔로우
      tx.delete(followingRef);
      tx.delete(followerRef);
      return { isFollowing: false };
    }

    // 팔로우
    tx.set(followingRef, { createdAt: serverTimestamp() });
    tx.set(followerRef, { createdAt: serverTimestamp() });
    return { isFollowing: true };
  });

  return result;
}

/**
 * isFollowingOnce
 * - "내가 target을 팔로우 중인지" 단발성 확인(getDoc)
 */
import { getDoc } from "firebase/firestore";

export async function isFollowingOnce(myUid, targetUid) {
  const followingRef = doc(db, "users", myUid, "following", targetUid);
  const snap = await getDoc(followingRef);
  return snap.exists();
}
