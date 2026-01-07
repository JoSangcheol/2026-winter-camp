// users 문서 만들기
import { useEffect, useState, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

import { auth, db } from '../firebase/firebase';
import { AuthContext } from './AuthContext';

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // 같은 uid에 대해 중복 실행 방지 (세션 내 안전장치)
  const ensuredUidRef = useRef(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setLoading(false);

      // 로그인 상태가 아니면 아무 것도 하지 않음
      if (!currentUser) {
        ensuredUidRef.current = null;
        return;
      }

      // 같은 uid로 이미 처리했으면 스킵
      if (ensuredUidRef.current === currentUser.uid) return;
      ensuredUidRef.current = currentUser.uid;

      // users/{uid} 문서 존재 여부 확인
      const userRef = doc(db, 'users', currentUser.uid);
      const snap = await getDoc(userRef);

      // 이미 있으면 생성하지 않음
      if (snap.exists()) return;

      // 기본값 대입으로 문서 생성
      const email = currentUser.email ?? '';
      const displayName = email.includes('@') ? email.split('@')[0] : 'user';

      await setDoc(userRef, {
        uid: currentUser.uid,
        email,
        displayName,
        bio: '안녕하세요!',
        photoURL: currentUser.photoURL ?? null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
