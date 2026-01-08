import { useEffect, useState } from "react";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/firebase";
import { useAuth } from "../auth/useAuth";
import DefaultInput from "../components/DefaultInput";
import { useNavigate } from "react-router-dom";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { useRef } from "react";
export default function ProfilePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [file, setFile] = useState(null);
  const [imageUrl, setImageUrl] = useState("");
  const fileInputRef = useRef();
  const MAX_SIZE_MB = 5;
  // 입력 상태
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [feedMode, setFeedMode] = useState('all'); // 'all' | 'following'
  //프로필 이미지 불러오기
  useEffect(() => {
    if (profile?.photoURL) {
      setImageUrl(profile.photoURL);
    }
  }, [profile]);
  // 프로필 읽기
  useEffect(() => {
    if (!user?.uid) return;
    const fetchProfile = async () => {
      const ref = doc(db, "users", user.uid);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        setProfile(data);
        setDisplayName(data.displayName ?? "");
        setBio(data.bio ?? "");
      }
      setLoading(false);
    };
    fetchProfile();
  }, [user?.uid]);
  // 프로필 저장(Update)
  const handleSave = async () => {
    if (!user?.uid) return;
    let photoURL = profile?.photoURL || "";
    if (file) {
      // Firebase Storage에 업로드
      const storage = getStorage();
      const imgRef = storageRef(storage, `profileImages/${user.uid}`);
      await uploadBytes(imgRef, file);
      photoURL = await getDownloadURL(imgRef);
    }
    const ref = doc(db, "users", user.uid);
    await updateDoc(ref, {
      displayName,
      bio,
      photoURL,
      updatedAt: serverTimestamp(),
    });
    alert("프로필이 저장되었습니다.");
  };
  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      setImageUrl(URL.createObjectURL(selected)); // 미리보기
    }
  };
  const handlePickImage = () => {
    fileInputRef.current.click();
  };
  if (loading) return <p>로딩 중...</p>;
  if (!profile) return <p>프로필 정보가 없습니다.</p>;
  const handleGoFeed = () => {
    navigate("/feed");
  };
  const handleClearImage = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  return (
    <div className='flex items-center min-h-screen p-4 bg-gray-50'>
      <div className='w-200 max-w-md mx-auto border-0 rounded-2xl bg-white p-6 shadow-xl space-y-4'>
        <div className='flex justify-between'>
          <h1 className='text-xl font-bold'>프로필 관리</h1>
          <button
            onClick={handleGoFeed}
            variant='secondary'
            className='border border-gray-300 px-3 py-1 rounded hover:bg-gray-300 hover:cursor-pointer hover:border-gray-300'
          >
            ← 피드로
          </button>
        </div>
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
            variant='secondary'
            onClick={handlePickImage}
            className='whitespace-nowrap w-auto px-2 py-1 text-xs bg-gray-200 rounded hover:bg-gray-300 hover:cursor-pointer'
          >
            이미지 업로드
          </button>

          <div className='flex-1 min-w-0'>
            {file ? (
              <p className='text-[11px] text-gray-700 truncate'>{file.name}</p>
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
              className='whitespace-nowrap w-auto px-2 py-1 text-[11px] rounded hover:bg-gray-300 hover:cursor-pointer'
            >
              제거
            </button>
          )}
        </div>
        {/* 닉네임 */}
        <div>
          <label className='block text-sm mb-1'>닉네임</label>
          <DefaultInput
            className='w-full border rounded px-3 py-2'
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        {/* 이메일 (읽기 전용) */}
        <div>
          <label className='block text-sm mb-1'>이메일</label>
          <DefaultInput
            className='w-full border rounded px-3 py-2 bg-gray-200 text-gray-400'
            value={profile.email}
            disabled
          />
        </div>
        {/* 소개 */}
        <div>
          <label className='block text-sm mb-1'>소개</label>
          <textarea
            className='bg-gray-100 w-full px-4 py-2 border-0 rounded-xl'
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
          />
        </div>
        <button
          onClick={handleSave}
          className='font-bold w-full h-12 py-2 rounded-xl bg-gray-900 text-white hover:bg-black hover:cursor-pointer'
        >
          저장하기
        </button>
      </div>
    </div>
  );
}
