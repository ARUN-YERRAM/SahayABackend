require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const twilio = require("twilio");
const admin = require("firebase-admin");
const cron = require("node-cron");

// Load your service account key file
const serviceAccount = require("./serviceAccountKey.json");

// Initialize Firebase Admin with your service account
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  // (For Firestore, the DATABASE_URL is not needed; Firestore uses different configuration)
});

const app = express();
const port = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Twilio Credentials from .env
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER; // Your Twilio SMS number

const client = twilio(accountSid, authToken);
// Initialize Firestore (instead of Realtime Database)
const db = admin.firestore();

/**
 * API endpoint to set a notification.
 * Expects JSON with "phoneNumber", "message", and "time" (in HH:mm 24-hour format).
 */
app.post("/set-notification", async (req, res) => {
  const { phoneNumber, message, time } = req.body;
  
  if (!phoneNumber || !message || !time) {
    return res.status(400).json({ success: false, error: "Missing required fields!" });
  }
  
  try {
    // Save the notification to the "notifications" collection in Firestore.
    const notificationsRef = db.collection("notifications");
    await notificationsRef.add({
      phoneNumber,
      message,
      time // Expected in HH:mm format (24-hour)
    });
    
    res.json({ success: true, message: "Notification scheduled successfully!" });
  } catch (error) {
    console.error("Error saving notification:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Handler to check scheduled notifications and send SMS.
 */
async function sendScheduledMessagesHandler() {
  // Get current time in "HH:MM" format (using en-GB locale)
  const now = new Date();
  const currentTime = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  console.log(`⏰ Checking scheduled messages for ${currentTime}...`);
  
  try {
    const snapshot = await db.collection("notifications").get();
    
    if (snapshot.empty) {
      console.log("📭 No scheduled notifications found.");
      return;
    }
    
    // Loop over each notification document
    snapshot.forEach(async (doc) => {
      const data = doc.data();
      if (data.time === currentTime) {
        console.log(`📩 Sending reminder to ${data.phoneNumber} at ${data.time}`);
        try {
          await client.messages.create({
            body: data.message,
            from: twilioPhoneNumber,
            to: data.phoneNumber,
          });
          console.log("✅ SMS sent successfully!");
          // Optionally, remove the notification to avoid duplicates:
          await db.collection("notifications").doc(doc.id).delete();
        } catch (error) {
          console.error("❌ Error sending SMS:", error);
        }
      }
    });
  } catch (error) {
    console.error("❌ Error fetching notifications:", error);
  }
}

/**
 * Local Scheduler: Use node-cron to run the handler every minute.
 */
if (process.env.USE_LOCAL_CRON === "true") {
  cron.schedule("*/1 * * * *", async () => {
    await sendScheduledMessagesHandler();
  });
  console.log("Local cron job scheduled to run every minute.");
}

// (Optional) Endpoint to manually trigger scheduled messages (for testing)
app.get("/trigger-scheduled", async (req, res) => {
  await sendScheduledMessagesHandler();
  res.send("Scheduled messages triggered");
});

/**
 * API endpoint to send an immediate message.
 */
app.post("/send-message", async (req, res) => {
  console.log("📩 Incoming Request:", req.body);
  
  const { phone, appointmentDetails } = req.body;
  if (!phone || !appointmentDetails) {
    return res.status(400).json({ success: false, error: "Missing phone number or appointment details!" });
  }
  
  try {
    const messageBody = `
      Your appointment is confirmed!
      Consultant: ${appointmentDetails.consultantName}
      Date: ${appointmentDetails.date}
      Time: ${appointmentDetails.time}
      Location: ${appointmentDetails.location}
      Specialization: ${appointmentDetails.specialization}
      Experience: ${appointmentDetails.experience} years
    `;
    
    const message = await client.messages.create({
      body: messageBody,
      from: twilioPhoneNumber,
      to: phone,
    });
    
    console.log("✅ SMS Sent:", message.sid);
    res.json({ success: true, message: "SMS sent successfully!" });
  } catch (error) {
    console.error("❌ Twilio Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start the Express server
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
  console.log("Connected to Firestore!!");
});
