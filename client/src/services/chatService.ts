import { 
  db, 
  auth 
} from "../lib/firebase";
import { 
  collection, 
  doc, 
  addDoc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp, 
  writeBatch, 
  increment, 
  deleteField,
  where,
  limit,
  Timestamp,
  getDocs
} from "firebase/firestore";

/**
 * Creates a new chat session for a booking or returns the existing one.
 */
export const createChat = async (
  bookingId: string,
  stationId: string,
  driverId: string,
  ownerId: string,
  driverName: string,
  ownerBusinessName: string,
  stationName: string
): Promise<string> => {
  try {
    const chatId = `${bookingId}_${driverId}`;
    const chatRef = doc(db, "chats", chatId);
    const chatSnap = await getDoc(chatRef);

    if (chatSnap.exists()) {
      return chatId;
    }

    // Create chat document
    await setDoc(chatRef, {
      chatId,
      bookingId,
      stationId,
      driverId,
      ownerId,
      driverName,
      ownerBusinessName,
      stationName,
      createdAt: serverTimestamp(),
      lastMessage: "Chat started",
      lastMessageAt: serverTimestamp(),
      lastMessageBy: "system",
      driverUnread: 0,
      ownerUnread: 0,
      status: "active"
    });

    // Add initial system message
    const messagesRef = collection(db, "chats", chatId, "messages");
    await addDoc(messagesRef, {
      senderId: "system",
      senderRole: "system",
      senderName: "System",
      text: `Chat started for your booking at ${stationName}. Ask the station owner any questions here.`,
      type: "system",
      sentAt: serverTimestamp(),
      read: true
    });

    return chatId;
  } catch (error: any) {
    console.error("Error creating chat:", error);
    throw error;
  }
};

/**
 * Sends a message and updates the chat metadata atomically.
 */
export const sendMessage = async (
  chatId: string,
  senderId: string,
  senderRole: "driver" | "owner",
  senderName: string,
  text: string
): Promise<void> => {
  const batch = writeBatch(db);
  const chatRef = doc(db, "chats", chatId);
  const messagesRef = collection(db, "chats", chatId, "messages");
  const newMessageRef = doc(messagesRef);

  // 1. Add message document
  batch.set(newMessageRef, {
    senderId,
    senderRole,
    senderName,
    text,
    type: "text",
    sentAt: serverTimestamp(),
    read: false
  });

  // 2. Update parent chat doc
  const chatUpdate: any = {
    lastMessage: text,
    lastMessageAt: serverTimestamp(),
    lastMessageBy: senderId
  };

  if (senderRole === "driver") {
    chatUpdate.ownerUnread = increment(1);
  } else {
    chatUpdate.driverUnread = increment(1);
  }

  batch.update(chatRef, chatUpdate);

  // 3. Commit batch
  await batch.commit();

  // 4. Create notification for the recipient
  const chatSnap = await getDoc(chatRef);
  if (chatSnap.exists()) {
    const chatData = chatSnap.data();
    const recipientId = senderRole === "driver" ? chatData.ownerId : chatData.driverId;
    const notificationTitle = senderRole === "driver" 
      ? "New message from driver" 
      : `Reply from ${senderName}`;
    
    // We use the appropriate ID field based on the recipient's role
    const notificationData: any = {
      type: "NEW_MESSAGE",
      title: notificationTitle,
      message: text.substring(0, 80),
      chatId,
      bookingId: chatData.bookingId,
      read: false,
      createdAt: serverTimestamp()
    };

    if (senderRole === "driver") {
      notificationData.ownerId = recipientId;
    } else {
      notificationData.userId = recipientId;
    }

    await addDoc(collection(db, "notifications"), notificationData);
  }
};

/**
 * Marks all messages as read for a specific role.
 */
export const markMessagesRead = async (
  chatId: string,
  readerRole: "driver" | "owner"
): Promise<void> => {
  const chatRef = doc(db, "chats", chatId);
  const updateData: any = {};

  if (readerRole === "driver") {
    updateData.driverUnread = 0;
  } else {
    updateData.ownerUnread = 0;
  }

  await updateDoc(chatRef, updateData);
};

/**
 * Subscribes to messages in a specific chat.
 */
export const subscribeToMessages = (
  chatId: string,
  callback: (messages: any[]) => void
) => {
  const q = query(
    collection(db, "chats", chatId, "messages"),
    orderBy("sentAt", "asc")
  );

  return onSnapshot(q, (snap) => {
    const messages = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    callback(messages);
  });
};

/**
 * Subscribes to active chats for a specific owner.
 */
export const subscribeToOwnerChats = (
  ownerId: string,
  callback: (chats: any[]) => void
) => {
  const q = query(
    collection(db, "chats"),
    where("ownerId", "==", ownerId),
    where("status", "==", "active"),
    orderBy("lastMessageAt", "desc"),
    limit(20)
  );

  return onSnapshot(q, (snap) => {
    const chats = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    callback(chats);
  });
};

/**
 * Closes a chat session and adds a system message.
 */
export const closeChat = async (chatId: string): Promise<void> => {
  const chatRef = doc(db, "chats", chatId);
  
  await updateDoc(chatRef, {
    status: "closed"
  });

  const messagesRef = collection(db, "chats", chatId, "messages");
  await addDoc(messagesRef, {
    senderId: "system",
    senderRole: "system",
    senderName: "System",
    text: "This chat has been closed after session completion.",
    type: "system",
    sentAt: serverTimestamp(),
    read: true
  });
};
/**
 * Subscribes to all chats across the platform (Admin only).
 */
export const subscribeToAllChats = (
  callback: (chats: any[]) => void
) => {
  const q = query(
    collection(db, "chats"),
    orderBy("lastMessageAt", "desc"),
    limit(100)
  );

  return onSnapshot(q, (snap) => {
    const chats = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    callback(chats);
  });
};

export const markAllRead = async (
  chatId: string,
  readerRole: "driver" | "owner"
) => {
  const field = readerRole === "driver"
    ? "driverUnread" : "ownerUnread";
  
  await updateDoc(doc(db, "chats", chatId), {
    [field]: 0
  });
}

export const getChatHistory = async (
  userId: string,
  role: "driver" | "owner"
) => {
  const field = role === "driver"
    ? "driverId" : "ownerId";
  
  const snap = await getDocs(query(
    collection(db, "chats"),
    where(field, "==", userId),
    orderBy("lastMessageAt", "desc"),
    limit(20)
  ));
  
  return snap.docs.map(d => ({
    id: d.id, ...d.data()
  }));
}

export const searchMessages = async (
  chatId: string,
  searchQuery: string
) => {
  const snap = await getDocs(
    collection(db, "chats", chatId, "messages"));
  
  const q = searchQuery.toLowerCase();
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter((m: any) => 
      m.text?.toLowerCase().includes(q))
    .sort((a: any, b: any) => 
      a.sentAt?.toDate() - b.sentAt?.toDate());
}

export const getChatStats = (
  chats: any[]
) => {
  return {
    totalChats: chats.length,
    activeChats: chats.filter(
      c => c.status === "active").length,
    totalUnread: chats.reduce(
      (s, c) => s + (c.ownerUnread || 0) + 
               (c.driverUnread || 0), 0),
    avgResponseTime: "~15 min"
  };
}
