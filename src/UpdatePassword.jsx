import { useState } from 'react';
import {
  getAuth,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth';

export default function UpdatePassword() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');

  const handleChangePassword = async () => {
    const auth = getAuth();
    const user = auth.currentUser;

    if (!user || !user.email) {
      setMessage('로그인이 필요합니다.');
      return;
    }

    setMessage('');

    try {
      const credential = EmailAuthProvider.credential(
        user.email,
        currentPassword
      );

      // 재인증
      await reauthenticateWithCredential(user, credential);

      // 재인증 성공 시 -> 비밀번호 업데이트 실행
      await updatePassword(user, newPassword);

      setMessage('비밀번호가 성공적으로 변경되었습니다.');
      setCurrentPassword('');
      setNewPassword('');
    } catch (error) {
      // JS에서는 타입이 없으니 안전하게 접근
      const code = error?.code;
      const msg = error?.message;

      if (code === 'auth/wrong-password') {
        setMessage('비밀번호가 일치하지 않습니다.');
      } else if (code === 'auth/requires-recent-login') {
        // 보안 정책상 "최근 로그인"이 필요할 때
        setMessage('재로그인이 필요합니다.');
      } else {
        setMessage(`에러: ${msg || '알 수 없는 오류'}`);
      }
    }
  };

  return (
    <div>
      <h4>비밀번호 변경</h4>

      <input
        type="password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        placeholder="현재 비밀번호"
      />
      <br />

      <input
        type="password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        placeholder="새 비밀번호"
      />
      <br />

      <button onClick={handleChangePassword}>변경하기</button>

      {message && <p>{message}</p>}
    </div>
  );
}
