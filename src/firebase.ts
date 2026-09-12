import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyBfjtsVhLb99meZGNWX5zV3wIiQPP-oyhU',
  authDomain: 'jinojino-6aba2.firebaseapp.com',
  projectId: 'jinojino-6aba2',
  storageBucket: 'jinojino-6aba2.firebasestorage.app',
  messagingSenderId: '835849328394',
  appId: '1:835849328394:web:5f17797c3461560bd2ccf3',
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
