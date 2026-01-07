import { useEffect, useState } from "react";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/firebase";
import { useAuth } from "../auth/useAuth";
import DefaultInput from "../components/DefaultInput";
import { useNavigate } from "react-router-dom";
export default function ProfilePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  // 입력 상태
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
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
    const ref = doc(db, "users", user.uid);
    await updateDoc(ref, {
      displayName,
      bio,
      updatedAt: serverTimestamp(),
    });
    alert("프로필이 저장되었습니다.");
  };
  if (loading) return <p>로딩 중...</p>;
  if (!profile) return <p>프로필 정보가 없습니다.</p>;
  const handleGoFeed = () => {
    navigate("/feed");
  };
  return (
    <div className='flex items-center min-h-screen p-4 bg-gray-50'>
      <div className='w-200 max-w-md mx-auto border-0 rounded-2xl bg-white p-6 shadow-xl space-y-4'>
        <div className="flex justify-between">
          <h1 className='text-xl font-bold'>프로필 관리</h1>
          <button
            onClick={handleGoFeed}
            variant='secondary'
            className='border border-gray-300 px-3 py-1 rounded hover:bg-gray-300 hover:cursor-pointer hover:border-gray-300'
          >
            ← 피드로
          </button>
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
