import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Firebase Admin SDK initialization
// For production, use a service account key
// For now, we'll use the project ID
const app = initializeApp({
  projectId: 'brij-fd601',
});

const db = getFirestore(app);

// Initialize default data if not exists
export async function initFirebase() {
  try {
    // Check if users exist
    const usersSnapshot = await db.collection('users').get();
    
    if (usersSnapshot.empty) {
      // Create default users
      await db.collection('users').doc('user1').set({
        id: 'user1',
        username: 'ahmed',
        password: '1234',
        displayName: 'أحمد',
        createdAt: new Date().toISOString()
      });
      
      await db.collection('users').doc('user2').set({
        id: 'user2',
        username: 'sara',
        password: '1234',
        displayName: 'سارة',
        createdAt: new Date().toISOString()
      });
      
      console.log('✅ Default users created');
    }

    // Check if settings exist
    const settingsSnapshot = await db.collection('settings').get();
    
    if (settingsSnapshot.empty) {
      await db.collection('settings').doc('global').set({
        monthly_balance: '0',
        createdAt: new Date().toISOString()
      });
      console.log('✅ Default settings created');
    }

    console.log('✅ Firebase initialized');
  } catch (error) {
    console.error('Firebase init error:', error.message);
  }
}

// User operations
export async function getUser(username, password) {
  const snapshot = await db.collection('users')
    .where('username', '==', username)
    .where('password', '==', password)
    .get();
  
  if (snapshot.empty) return null;
  return snapshot.docs[0].data();
}

export async function getUserById(id) {
  const doc = await db.collection('users').doc(id).get();
  if (!doc.exists) return null;
  return doc.data();
}

export async function updateUser(id, data) {
  const updateData = {};
  if (data.password) updateData.password = data.password;
  if (data.displayName) updateData.displayName = data.displayName;
  updateData.updatedAt = new Date().toISOString();
  
  await db.collection('users').doc(id).update(updateData);
}

export async function getAllUsers() {
  const snapshot = await db.collection('users').get();
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return { id: data.id, username: data.username, displayName: data.displayName };
  });
}

// Transaction operations
export async function addTransaction(transaction) {
  const docRef = db.collection('transactions').doc();
  await docRef.set({
    ...transaction,
    id: docRef.id,
    createdAt: new Date().toISOString()
  });
  return docRef.id;
}

export async function getTransactions(userId, filters = {}) {
  let query = db.collection('transactions').where('userId', '==', userId);
  
  if (filters.type) query = query.where('type', '==', filters.type);
  if (filters.category) query = query.where('category', '==', filters.category);
  if (filters.monthKey) query = query.where('monthKey', '==', filters.monthKey);
  
  query = query.orderBy('sourceTimestamp', 'desc');
  
  if (filters.limit) query = query.limit(filters.limit);
  
  const snapshot = await query.get();
  return snapshot.docs.map(doc => doc.data());
}

export async function updateTransaction(id, data) {
  await db.collection('transactions').doc(id).update({
    ...data,
    updatedAt: new Date().toISOString()
  });
}

export async function deleteTransaction(id) {
  await db.collection('transactions').doc(id).delete();
}

// Settings operations
export async function getSetting(userId, key) {
  const doc = await db.collection('settings').doc(`${userId}_${key}`).get();
  if (!doc.exists) {
    // Try global setting
    const globalDoc = await db.collection('settings').doc(`global_${key}`).get();
    if (globalDoc.exists) return globalDoc.data().value;
    return null;
  }
  return doc.data().value;
}

export async function setSetting(userId, key, value) {
  await db.collection('settings').doc(`${userId}_${key}`).set({
    value: String(value),
    updatedAt: new Date().toISOString()
  });
}

export async function getUserSettings(userId) {
  const monthlyBalance = await getSetting(userId, 'monthly_balance') || '0';
  const budgetsStr = await getSetting(userId, 'budgets') || '{}';
  const savingsGoal = await getSetting(userId, 'savings_goal') || '0';
  const savingsSaved = await getSetting(userId, 'savings_saved') || '0';
  
  return {
    monthly_balance: parseFloat(monthlyBalance),
    budgets: JSON.parse(budgetsStr),
    savings_goal: savingsGoal,
    savings_saved: savingsSaved
  };
}

export { db };
