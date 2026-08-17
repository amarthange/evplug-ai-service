const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

/**
 * Triggered when a booking document is updated.
 * Sends a push notification when status changes from 'active' to 'completed'.
 */
exports.sendSessionCompleteNotification = functions.firestore
    .document("bookings/{bookingId}")
    .onUpdate(async (change) => {
        const newData = change.after.data();
        const oldData = change.before.data();

        // Only trigger when status changes to 'completed'
        if (oldData.status === "completed" || newData.status !== "completed") {
            return null;
        }

        const userId = newData.userId;
        if (!userId) return null;

        try {
            // 1. Fetch user data for FCM token and preferences
            const userSnap = await admin.firestore()
                .collection("users").doc(userId).get();
            if (!userSnap.exists) return null;

            const userData = userSnap.data();
            const fcmToken = userData.fcmToken;

            // 2. Check if user has enabled notifications
            const settings = userData.settings;
            const isEnabled = settings?.notifications?.sessionComplete !== false;

            if (fcmToken && isEnabled) {
                const message = {
                    notification: {
                        title: "Charging Complete! ⚡",
                        body: "Your charging session is now finished.",
                    },
                    token: fcmToken,
                };

                const response = await admin.messaging().send(message);
                console.log("Successfully sent message:", response);
            } else {
                console.log("Notification not sent: No token or disabled.");
            }
        } catch (error) {
            console.error("Error sending notification:", error);
        }

        return null;
    });
