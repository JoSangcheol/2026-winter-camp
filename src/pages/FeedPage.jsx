import { useEffect, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from 'firebase/storage';
import { useNavigate } from 'react-router-dom';

import { auth, db, storage } from '../firebase/firebase';
import { useAuth } from '../auth/useAuth';


const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SIZE_MB = 5;

export default function FeedPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (!user?.uid) return;

    const fetchProfile = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) setProfile(snap.data());
      } catch (err) {
        console.log('프로필 읽기 실패:', err);
      }
    };

    fetchProfile();
  }, [user?.uid]);

  const displayName =
    profile?.displayName ?? (user?.email ? user.email.split('@')[0] : 'user');
  const photoURL = profile?.photoURL ?? null;

  const handleGoProfile = () => {
    navigate('/profile');
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  const reloadPosts = async () => {
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    setPosts(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => {
    if (!user?.uid) return;

    const load = async () => {
      setLoading(true);
      try {
        await reloadPosts();
      } catch (err) {
        console.log('게시글 불러오기 실패:', err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user?.uid]);

  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const fileInputRef = useRef(null);

  const validateImageFile = (f) => {
    if (!f) return { ok: true };
    if (!ALLOWED_MIME.has(f.type)) {
      return {
        ok: false,
        message: 'JPG, PNG, WEBP 이미지 파일만 업로드할 수 있어요.',
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

  const handlePickImage = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const picked = e.target.files?.[0] ?? null;

    if (!picked) {
      setFile(null);
      return;
    }

    const v = validateImageFile(picked);
    if (!v.ok) {
      alert(v.message);
      e.target.value = '';
      setFile(null);
      return;
    }

    setFile(picked);
  };

  const handleClearImage = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCreatePost = async (e) => {
    e.preventDefault();
    if (!user?.uid) return;

    const trimmed = text.trim();
    if (!trimmed) {
      alert('내용을 입력해 주세요.');
      return;
    }

    const v = validateImageFile(file);
    if (!v.ok) {
      alert(v.message);
      return;
    }

    try {
      setSubmitting(true);

      // 1) 게시글 먼저 생성(문서 ID 확보)
      const docRef = await addDoc(collection(db, 'posts'), {
        text: trimmed,
        uid: user.uid,
        authorName: displayName,
        authorPhotoURL: photoURL,
        imageURL: null,
        imagePath: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 2) 이미지가 있다면 Storage 업로드(경로/파일명 고정)
      if (file) {
        const ext =
          file.type === 'image/png'
            ? 'png'
            : file.type === 'image/webp'
            ? 'webp'
            : 'jpg';

        const imagePath = `posts/${user.uid}/${docRef.id}/image.${ext}`;
        const storageRef = ref(storage, imagePath);

        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);

        // 3) 게시글 Update로 imageURL + imagePath 저장
        await updateDoc(doc(db, 'posts', docRef.id), {
          imageURL: url,
          imagePath,
          updatedAt: serverTimestamp(),
        });
      }

      setText('');
      handleClearImage();
      await reloadPosts();
    } catch (err) {
      console.log('게시글 등록 실패:', err);
      alert('게시글 등록 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [updating, setUpdating] = useState(false);

  const startEdit = (post) => {
    setEditingId(post.id);
    setEditingText(post.text ?? '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingText('');
  };

  const handleUpdatePost = async (post) => {
    if (!user?.uid) return;

    if (post.uid !== user.uid) {
      alert('작성자만 수정할 수 있어요.');
      return;
    }

    const trimmed = editingText.trim();
    if (!trimmed) {
      alert('내용을 입력해 주세요.');
      return;
    }

    try {
      setUpdating(true);

      await updateDoc(doc(db, 'posts', post.id), {
        text: trimmed,
        updatedAt: serverTimestamp(),
      });

      cancelEdit();
      await reloadPosts();
    } catch (err) {
      console.log('게시글 수정 실패:', err);
      alert('게시글 수정 중 오류가 발생했습니다.');
    } finally {
      setUpdating(false);
    }
  };

  const handleDeletePost = async (post) => {
    if (!user?.uid) return;

    if (post.uid !== user.uid) {
      alert('작성자만 삭제할 수 있어요.');
      return;
    }

    const ok = confirm('정말 삭제할까요?');
    if (!ok) return;

    try {
      // 이미지가 있으면 Storage 파일도 같이 삭제 (imagePath 기준)
      if (post.imagePath) {
        await deleteObject(ref(storage, post.imagePath));
      }

      await deleteDoc(doc(db, 'posts', post.id));
      await reloadPosts();
    } catch (err) {
      console.log('게시글 삭제 실패:', err);
      alert('게시글 삭제 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="min-h-screen p-4 bg-gray-50">
      <header className="max-w-md mx-auto mb-4 flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold shrink-0">Mini SNS</h1>

        <div className="flex items-center gap-2 flex-nowrap">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full border bg-white overflow-hidden flex items-center justify-center shrink-0">
              {photoURL ? (
                <img
                  src={photoURL}
                  alt="profile"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-4xl text-gray-500">🙂</span>
              )}
            </div>

            <span className="text-sm text-gray-700 truncate max-w-[90px]">
              {displayName}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-nowrap">
            <button
              onClick={handleGoProfile}
              variant="primary"
              className="border border-gray-300 px-3 py-1 rounded hover:bg-gray-300 hover:cursor-pointer hover:border-gray-300"
            >
              프로필 관리
            </button>

            <button
              onClick={handleLogout}
              className="border border-gray-300 px-3 py-1 rounded hover:bg-red-600 hover:cursor-pointer hover:border-red-600 hover:text-white"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto space-y-3">
        <div className="p-4">
          <form onSubmit={handleCreatePost} className="space-y-3">
            <p className="font-semibold">새 게시글</p>

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="오늘 무슨 일이 있었나요?"
              className="w-full p-2 text-sm bg-gray-100 px-4 py-2 border-0 rounded-xl"
              rows={3}
            />

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              className="hidden"
            />

            <div className="flex items-center gap-2">
              <button
                type="button"
                variant="secondary"
                onClick={handlePickImage}
                className="whitespace-nowrap w-auto px-2 py-1 text-xs bg-gray-200 rounded hover:bg-gray-300 hover:cursor-pointer"
              >
                이미지 업로드
              </button>

              <div className="flex-1 min-w-0">
                {file ? (
                  <p className="text-[11px] text-gray-700 truncate">
                    {file.name}
                  </p>
                ) : (
                  <p className="text-[11px] text-gray-500">
                    JPG / PNG / WEBP (최대 {MAX_SIZE_MB}MB)
                  </p>
                )}
              </div>

              {file && (
                <button
                  type="button"
                  onClick={handleClearImage}
                  className="whitespace-nowrap w-auto px-2 py-1 text-[11px] rounded hover:bg-gray-300 hover:cursor-pointer"
                >
                  제거
                </button>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                variant="primary"
                className="whitespace-nowrap w-full px-3 py-3 text-base bg-black text-white rounded-xl hover:cursor-pointer hover:bg-gray-800"
                disabled={submitting}
              >
                {submitting ? '등록 중...' : '등록'}
              </button>
            </div>
          </form>
        </div>
        <hr className='border-none h-0.25 bg-gray-300 mb-5'/>
        {loading ? (
          <p className="text-sm text-center text-gray-500">
            게시글 불러오는 중...
          </p>
        ) : posts.length === 0 ? (
          <p className="text-sm text-center text-gray-500">
            아직 게시글이 없습니다.
          </p>
        ) : (
          posts.map((post) => {
            const isMine = post.uid === user?.uid;
            const isEditing = editingId === post.id;

            return (
              <div key={post.id} className="p-4 space-y-2 border border-gray-200 rounded-xl">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-sm truncate">
                    {post.authorName ?? 'unknown'}
                  </p>

                  {isMine && !isEditing && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        variant="secondary"
                        className="border border-gray-300 px-3 py-1 rounded hover:bg-gray-300 hover:cursor-pointer hover:border-gray-300"
                        onClick={() => startEdit(post)}
                      >
                        수정
                      </button>

                      <button
                        type="button"
                        className="border border-red-600 bg-red-600 text-white px-3 py-1 rounded hover:bg-red-900 hover:cursor-pointer hover:border-red-900"
                        onClick={() => handleDeletePost(post)}
                      >
                        삭제
                      </button>
                    </div>
                  )}
                </div>

                {isEditing ? (
                  <div className="space-y-2">
                    <textarea
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      className="w-full p-2 text-sm bg-gray-100 px-4 py-2 border-0 rounded-xl"
                      rows={3}
                    />

                    <div className="flex gap-2">
                      <button
                        type="button"
                        variant="secondary"
                        className="flex-1 py-2 border border-gray-300 px-3 rounded-xl hover:bg-gray-300 hover:cursor-pointer hover:border-gray-300"
                        onClick={cancelEdit}
                        disabled={updating}
                      >
                        취소
                      </button>

                      <button
                        type="button"
                        variant="primary"
                        className="flex-1 py-2 border border-black text-white bg-black px-3 rounded-xl hover:bg-gray-800 hover:cursor-pointer hover:border-gray-800"
                        onClick={() => handleUpdatePost(post)}
                        disabled={updating}
                      >
                        {updating ? '저장 중...' : '저장'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {post.text}
                  </p>
                )}

                {post.imageURL && (
                  <img
                    src={post.imageURL}
                    alt="post"
                    className="w-full rounded border"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                )}
              </div>
            );
          })
        )}
      </main>
    </div>
  );
}