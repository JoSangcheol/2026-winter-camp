import { useEffect, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  runTransaction,
} from "firebase/firestore";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";
import { useNavigate } from "react-router-dom";

import { auth, db, storage } from "../firebase/firebase";
import { useAuth } from "../auth/useAuth";
import { fetchFollowingTimelineOnce } from "../social/timeline";
import FollowButton from "../components/FollowButton";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SIZE_MB = 5;
const FOLLOWING_IN_LIMIT = 10;

export default function FeedPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  /* -------------------------
       상단바: 프로필 읽기
    -------------------------- */
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (!user?.uid) return;

    const fetchProfile = async () => {
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) setProfile(snap.data());
      } catch (err) {
        console.log("프로필 읽기 실패:", err);
      }
    };

    fetchProfile();
  }, [user?.uid]);

  const displayName =
    profile?.displayName ?? (user?.email ? user.email.split("@")[0] : "user");
  const photoURL = profile?.photoURL ?? null;

  const handleGoProfile = () => navigate("/profile");

  const handleLogout = async () => {
    await signOut(auth);
  };

  /* -------------------------
       ✅ 탭 상태: 전체 / 팔로잉
       - 기본은 전체로 두는 게 UX가 덜 막힘
    -------------------------- */
  const [feedMode, setFeedMode] = useState("all"); // 'all' | 'following'

  /* -------------------------
     ✅ 타임라인(실시간)
  -------------------------- */
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  // 팔로잉 탭에서 안내 문구용
  const [followingCount, setFollowingCount] = useState(0);
  // 좋아요(내가 눌렀는지) 상태 맵: { [postId]: true/false }
  const [likedMap, setLikedMap] = useState({});

  useEffect(() => {
    if (!user?.uid) return;

    setLoading(true);
    let unsubscribePosts = null;
    let unsubscribeFollowing = null;

    // 1) 전체 타임라인(Explore)
    if (feedMode === "all") {
      const postsQ = query(
        collection(db, "posts"),
        orderBy("createdAt", "desc"),
        limit(50)
      );

      unsubscribePosts = onSnapshot(
        postsQ,
        async (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setPosts(list);
          setLoading(false);

          // 좋아요 상태 체크 (06_like.jsx와 동일)
          try {
            const checks = await Promise.all(
              list.map(async (p) => {
                const likeRef = doc(db, "posts", p.id, "likes", user.uid);
                const likeSnap = await getDoc(likeRef);
                return [p.id, likeSnap.exists()];
              })
            );
            setLikedMap((prev) => {
              const next = { ...prev };
              for (const [postId, liked] of checks) next[postId] = liked;
              return next;
            });
          } catch (err) {
            console.log("좋아요 상태 체크 실패:", err);
          }
        },
        (err) => {
          console.log("전체 타임라인 구독 실패:", err);
          setLoading(false);
        }
      );
      return () => {
        if (unsubscribePosts) unsubscribePosts();
      };
    }

    // 2) 팔로잉 타임라인(Following)
    if (feedMode === "following") {
      const followingCol = collection(db, "users", user.uid, "following");
      let innerUnsubPosts = null;
      unsubscribeFollowing = onSnapshot(
        followingCol,
        (followingSnap) => {
          const followingUids = followingSnap.docs.map((d) => d.id);
          setFollowingCount(followingUids.length);
          const authorUids = Array.from(new Set([user.uid, ...followingUids]));
          const limited = authorUids.slice(0, FOLLOWING_IN_LIMIT);
          if (limited.length === 0) {
            setPosts([]);
            setLoading(false);
            if (innerUnsubPosts) {
              innerUnsubPosts();
              innerUnsubPosts = null;
            }
            return;
          }
          if (innerUnsubPosts) innerUnsubPosts();
          const postsQ = query(
            collection(db, "posts"),
            where("uid", "in", limited),
            orderBy("createdAt", "desc"),
            limit(50)
          );
          innerUnsubPosts = onSnapshot(
            postsQ,
            async (postsSnap) => {
              const list = postsSnap.docs.map((d) => ({
                id: d.id,
                ...d.data(),
              }));
              setPosts(list);
              setLoading(false);
              // 좋아요 상태 체크 (06_like.jsx와 동일)
              try {
                const checks = await Promise.all(
                  list.map(async (p) => {
                    const likeRef = doc(db, "posts", p.id, "likes", user.uid);
                    const likeSnap = await getDoc(likeRef);
                    return [p.id, likeSnap.exists()];
                  })
                );
                setLikedMap((prev) => {
                  const next = { ...prev };
                  for (const [postId, liked] of checks) next[postId] = liked;
                  return next;
                });
              } catch (err) {
                console.log("좋아요 상태 체크 실패:", err);
              }
            },
            (err) => {
              console.log("팔로잉 타임라인 posts 구독 실패:", err);
              setLoading(false);
            }
          );
        },
        (err) => {
          console.log("following 구독 실패:", err);
          setLoading(false);
        }
      );
      return () => {
        if (unsubscribeFollowing) unsubscribeFollowing();
        if (innerUnsubPosts) innerUnsubPosts();
      };
    }
    setLoading(false);
    return () => {};
  }, [user?.uid, feedMode]);

  /* -------------------------
     좋아요 토글(Like / Unlike)
     - posts/{postId}/likes/{myUid} 생성/삭제
     - posts/{postId}.likeCount +/- (트랜잭션)
  -------------------------- */
  const handleToggleLike = async (post) => {
    if (!user?.uid) return;
    const postId = post.id;
    const postRef = doc(db, "posts", postId);
    const likeRef = doc(db, "posts", postId, "likes", user.uid);
    // Optimistic UI
    const wasLiked = !!likedMap[postId];
    setLikedMap((prev) => ({ ...prev, [postId]: !wasLiked }));
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        const current = p.likeCount ?? 0;
        const next = Math.max(0, current + (wasLiked ? -1 : 1));
        return { ...p, likeCount: next };
      })
    );
    try {
      await runTransaction(db, async (tx) => {
        const [postSnap, likeSnap] = await Promise.all([
          tx.get(postRef),
          tx.get(likeRef),
        ]);
        if (!postSnap.exists()) throw new Error("Post does not exist");
        const currentCount = postSnap.data().likeCount ?? 0;
        // unlike
        if (likeSnap.exists()) {
          tx.delete(likeRef);
          tx.update(postRef, { likeCount: Math.max(0, currentCount - 1) });
          return;
        }
        // like
        tx.set(likeRef, { createdAt: serverTimestamp() });
        tx.update(postRef, { likeCount: currentCount + 1 });
      });
      // onSnapshot이 갱신
    } catch (err) {
      console.log("좋아요 토글 실패:", err);
      // 롤백
      setLikedMap((prev) => ({ ...prev, [postId]: wasLiked }));
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id !== postId) return p;
          const current = p.likeCount ?? 0;
          const next = Math.max(0, current + (wasLiked ? +1 : -1));
          return { ...p, likeCount: next };
        })
      );
      alert("좋아요 처리 중 오류가 발생했습니다.");
    }
  };

  /* -------------------------
       이미지 업로드 공통
    -------------------------- */
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  const validateImageFile = (f) => {
    if (!f) return { ok: true };
    if (!ALLOWED_MIME.has(f.type)) {
      return {
        ok: false,
        message: "JPG, PNG, WEBP 이미지 파일만 업로드할 수 있어요.",
      };
    }
    const sizeMb = f.size / (1024 * 1024);
    if (sizeMb > MAX_SIZE_MB) {
      return {
        ok: false,
        message: `이미지 용량은 ${MAX_SIZE_MB}MB 이하만 업로드할 수 있어요.`,
      };
    }
    return { ok: true };
  };

  const handlePickImage = () => fileInputRef.current?.click();

  const handleFileChange = (e) => {
    const picked = e.target.files?.[0] ?? null;

    if (!picked) {
      setFile(null);
      return;
    }

    const v = validateImageFile(picked);
    if (!v.ok) {
      alert(v.message);
      e.target.value = "";
      setFile(null);
      return;
    }

    setFile(picked);
  };

  const handleClearImage = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /* -------------------------
       게시글 등록(Create)
    -------------------------- */
  const handleCreatePost = async (e) => {
    e.preventDefault();
    if (!user?.uid) return;

    const trimmed = text.trim();
    if (!trimmed) {
      alert("내용을 입력해 주세요.");
      return;
    }

    const v = validateImageFile(file);
    if (!v.ok) {
      alert(v.message);
      return;
    }

    try {
      setSubmitting(true);

      const docRef = await addDoc(collection(db, "posts"), {
        text: trimmed,
        uid: user.uid,
        authorName: displayName,
        authorPhotoURL: photoURL,
        imageURL: null,
        imagePath: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (file) {
        const ext =
          file.type === "image/png"
            ? "png"
            : file.type === "image/webp"
            ? "webp"
            : "jpg";

        const imagePath = `posts/${user.uid}/${docRef.id}/image.${ext}`;
        const storageRef = ref(storage, imagePath);

        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);

        await updateDoc(doc(db, "posts", docRef.id), {
          imageURL: url,
          imagePath,
          updatedAt: serverTimestamp(),
        });
      }

      setText("");
      handleClearImage();
      // ✅ 타임라인은 onSnapshot이 자동 반영
    } catch (err) {
      console.log("게시글 등록 실패:", err);
      alert("게시글 등록 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  /* -------------------------
       게시글 수정(Update)
    -------------------------- */
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [updating, setUpdating] = useState(false);

  const startEdit = (post) => {
    setEditingId(post.id);
    setEditingText(post.text ?? "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingText("");
  };

  const handleUpdatePost = async (post) => {
    if (!user?.uid) return;

    if (post.uid !== user.uid) {
      alert("작성자만 수정할 수 있어요.");
      return;
    }

    const trimmed = editingText.trim();
    if (!trimmed) {
      alert("내용을 입력해 주세요.");
      return;
    }

    try {
      setUpdating(true);

      await updateDoc(doc(db, "posts", post.id), {
        text: trimmed,
        updatedAt: serverTimestamp(),
      });

      cancelEdit();
    } catch (err) {
      console.log("게시글 수정 실패:", err);
      alert("게시글 수정 중 오류가 발생했습니다.");
    } finally {
      setUpdating(false);
    }
  };

  /* -------------------------
      게시글 삭제(Delete)
    -------------------------- */
  const handleDeletePost = async (post) => {
    if (!user?.uid) return;

    if (post.uid !== user.uid) {
      alert("작성자만 삭제할 수 있어요.");
      return;
    }

    const ok = confirm("정말 삭제할까요?");
    if (!ok) return;

    try {
      if (post.imagePath) {
        await deleteObject(ref(storage, post.imagePath));
      }

      await deleteDoc(doc(db, "posts", post.id));
    } catch (err) {
      console.log("게시글 삭제 실패:", err);
      alert("게시글 삭제 중 오류가 발생했습니다.");
    }
  };
  return (
    <div className='min-h-screen p-4 bg-gray-50'>
      <header className='max-w-md mx-auto mb-4 flex items-center justify-between gap-3'>
        <h1 className='text-lg font-bold shrink-0'>Mini SNS</h1>
        <div className='flex items-center gap-2 flex-nowrap'>
          <div
            className='flex p-1 items-center gap-2 min-w-0 rounded hover:cursor-pointer hover:bg-gray-200 cursor-pointer'
            onClick={handleGoProfile}
          >
            <div className='w-8 h-8 rounded-full border bg-white overflow-hidden flex items-center justify-center shrink-0'>
              {photoURL ? (
                <img
                  src={photoURL}
                  alt='profile'
                  className='w-full h-full object-cover'
                />
              ) : (
                <span className='text-4xl text-gray-500'>🙂</span>
              )}
            </div>
            <span className='text-sm text-gray-700 truncate max-w-[90px]'>
              {displayName}
            </span>
          </div>
          <button
            onClick={handleLogout}
            className='border border-gray-300 px-3 py-1 rounded hover:bg-red-600 hover:cursor-pointer hover:border-red-600 hover:text-white cursor-pointer'
          >
            로그아웃
          </button>
        </div>
      </header>
      <main className='max-w-md mx-auto space-y-3'>
        {/* ✅ 탭 UI: 전체 / 팔로잉 */}
        <div className='p-3'>
          <div className='flex gap-2'>
            <button
              type='button'
              className={`flex-1 py-2 rounded-xl font-semibold cursor-pointer hover:cursor-pointer ${
                feedMode === "all"
                  ? "bg-gray-900 text-white"
                  : "bg-gray-200 text-gray-700"
              }`}
              onClick={() => setFeedMode("all")}
            >
              전체
            </button>
            <button
              type='button'
              className={`flex-1 py-2 rounded-xl font-semibold cursor-pointer hover:cursor-pointer ${
                feedMode === "following"
                  ? "bg-gray-900 text-white"
                  : "bg-gray-200 text-gray-700"
              }`}
              onClick={() => setFeedMode("following")}
            >
              팔로잉
            </button>
          </div>

          {feedMode === "following" && (
            <p className='mt-2 text-xs text-gray-600'>
              팔로우 {followingCount}명 (내 글 포함, 최대 {FOLLOWING_IN_LIMIT}
              명까지)
            </p>
          )}
        </div>

        <div className='p-4'>
          <form onSubmit={handleCreatePost} className='space-y-3'>
            <p className='font-semibold'>새 게시글</p>

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder='오늘 무슨 일이 있었나요?'
              className='w-full border rounded p-2 text-sm'
              rows={3}
            />

            <input
              ref={fileInputRef}
              type='file'
              accept='image/jpeg,image/png,image/webp'
              onChange={handleFileChange}
              className='hidden'
            />

            <div className='flex items-center gap-2'>
              <button
                type='button'
                onClick={handlePickImage}
                className='whitespace-nowrap w-auto px-2 py-1 text-xs border border-dashed bg-gray-200 rounded hover:bg-gray-300 cursor-pointer hover:cursor-pointer'
              >
                이미지 업로드
              </button>

              <div className='flex-1 min-w-0'>
                {file ? (
                  <p className='text-[11px] text-gray-700 truncate'>
                    {file.name}
                  </p>
                ) : (
                  <p className='text-[11px] text-gray-500'>
                    JPG / PNG / WEBP (최대 {MAX_SIZE_MB}MB)
                  </p>
                )}
              </div>

              {file && (
                <button
                  type='button'
                  onClick={handleClearImage}
                  className='whitespace-nowrap w-auto px-2 py-1 text-[11px] rounded hover:bg-gray-300 cursor-pointer hover:cursor-pointer'
                >
                  제거
                </button>
              )}
            </div>

            <div className='flex justify-end'>
              <button
                type='submit'
                className='font-bold w-full h-12 py-2 rounded-xl bg-gray-900 text-white hover:bg-black cursor-pointer hover:cursor-pointer text-base'
                disabled={submitting}
              >
                {submitting ? "등록 중..." : "등록"}
              </button>
            </div>
          </form>
        </div>

        {loading ? (
          <p className='text-sm text-center text-gray-500'>
            타임라인 불러오는 중...
          </p>
        ) : posts.length === 0 ? (
          <div className='p-4'>
            <p className='text-sm text-center text-gray-600'>
              아직 게시글이 없습니다.
            </p>
            <p className='text-xs text-center text-gray-500 mt-1'>
              {feedMode === "following"
                ? "팔로잉 탭은 “나 + 내가 팔로우한 사람” 글만 보여요."
                : "전체 탭은 모든 글을 보여요."}
            </p>
            {feedMode === "following" && (
              <div className='mt-3'>
                <button
                  type='button'
                  className='w-full py-2 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold cursor-pointer hover:cursor-pointer'
                  onClick={() => setFeedMode("all")}
                >
                  전체 글 보기로 전환
                </button>
              </div>
            )}
          </div>
        ) : (
          posts.map((post) => {
            const isMine = post.uid === user?.uid;
            const isEditing = editingId === post.id;
            const liked = !!likedMap[post.id];
            const likeCount = post.likeCount ?? 0;
            return (
              <div key={post.id} className='p-4 space-y-2'>
                {/* 작성자 + (남의 글이면) 팔로우 버튼 */}
                <div className='flex items-center justify-between gap-2'>
                  <p className='font-semibold text-sm truncate'>
                    {post.authorName ?? "unknown"}
                  </p>
                  <div className='flex items-center gap-2'>
                    {!isMine && <FollowButton targetUid={post.uid} />}
                    {isMine && !isEditing && (
                      <div className='flex gap-2'>
                        <button
                          type='button'
                          className='whitespace-nowrap w-auto px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 cursor-pointer hover:cursor-pointer'
                          onClick={() => startEdit(post)}
                        >
                          수정
                        </button>
                        <button
                          type='button'
                          className='whitespace-nowrap w-auto px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 cursor-pointer hover:cursor-pointer'
                          onClick={() => handleDeletePost(post)}
                        >
                          삭제
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {isEditing ? (
                  <div className='space-y-2'>
                    <textarea
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      className='w-full border rounded p-2 text-sm'
                      rows={3}
                    />
                    <div className='flex gap-2'>
                      <button
                        type='button'
                        className='flex-1 py-2 rounded bg-gray-200 hover:bg-gray-300 cursor-pointer hover:cursor-pointer'
                        onClick={cancelEdit}
                        disabled={updating}
                      >
                        취소
                      </button>
                      <button
                        type='button'
                        className='flex-1 py-2 rounded bg-gray-900 text-white hover:bg-black cursor-pointer hover:cursor-pointer'
                        onClick={() => handleUpdatePost(post)}
                        disabled={updating}
                      >
                        {updating ? "저장 중..." : "저장"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className='text-sm text-gray-700 whitespace-pre-wrap'>
                    {post.text}
                  </p>
                )}
                {post.imageURL && (
                  <img
                    src={post.imageURL}
                    alt='post'
                    className='w-full rounded border'
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                )}
                {/* ✅ 좋아요 영역 (06_like.jsx와 동일) */}
                <div className='pt-2 flex items-center justify-between'>
                  <button
                    type='button'
                    onClick={() => handleToggleLike(post)}
                    className='text-sm px-2 py-1 border rounded bg-white hover:bg-gray-100 cursor-pointer hover:cursor-pointer'
                    title={liked ? "좋아요 취소" : "좋아요"}
                  >
                    {liked ? "❤️" : "🤍"} 좋아요
                  </button>
                  <span className='text-sm text-gray-600'>
                    좋아요 {likeCount}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </main>
    </div>
  );
}
