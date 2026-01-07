import { useState, useEffect } from 'react';
import { db, auth } from './firebase/firebase';
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  deleteDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';

const Board = ({ user }) => {
  const [posts, setPosts] = useState([]);
  const [newPost, setNewPost] = useState('');

  useEffect(() => {
    const postsCollection = collection(db, 'posts');
    const q = query(postsCollection, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const postsData = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      setPosts(postsData);
    });

    return () => unsubscribe();
  }, []);

  const handleAddPost = async () => {
    if (newPost.trim() === '') return;

    try {
      await addDoc(collection(db, 'posts'), {
        text: newPost,
        createdAt: serverTimestamp(),
        userId: user.uid,
      });
      setNewPost('');
    } catch (err) {
      console.error('실패:', err);
    }
  };

  const handleDeletePost = async (postId, userId) => {
    if (user.uid !== userId) {
      alert('본인이 작성한 글만 삭제할 수 있습니다.');
      return;
    }

    try {
      await deleteDoc(doc(db, 'posts', postId));
    } catch (err) {
      console.error('실패:', err);
    }
  };

  return (
    <div>
      <div>
        환영합니다, {user?.email} 님!{' '}
        <button onClick={() => auth.signOut()}>로그아웃</button>
      </div>

      <h4>새 글 작성</h4>
      <input
        type="text"
        value={newPost}
        placeholder="내용을 입력하세요"
        onChange={(e) => setNewPost(e.target.value)}
      />
      <button onClick={handleAddPost}>등록</button>

      <hr />

      <h4>게시글 목록</h4>
      <ul>
        {posts.map((post) => (
          <li key={post.id}>
            {post.text} (작성시간:{' '}
            {post.createdAt?.toDate
              ? post.createdAt.toDate().toLocaleString()
              : '작성 중...'}
            )
            {user.uid === post.userId && (
              <button onClick={() => handleDeletePost(post.id, post.userId)}>
                삭제
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Board;
