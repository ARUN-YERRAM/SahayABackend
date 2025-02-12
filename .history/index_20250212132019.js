// require("dotenv").config();
// const express = require("express");
// const cors = require("cors");
// const bodyParser = require("body-parser");
// const twilio = require("twilio");


// const admin = require("firebase-admin");
// const functions = require("firebase-functions");
// // const twilio = require("twilio");
// const cron = require("node-cron");

// admin.initializeApp();

// const app = express();
// const port = process.env.PORT || 4000;

// // Middleware
// app.use(cors());
// app.use(bodyParser.json());

// // Twilio Credentials from .env
// const accountSid = process.env.TWILIO_ACCOUNT_SID;
// const authToken = process.env.TWILIO_AUTH_TOKEN;
// const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER; // Ensure this is your Twilio SMS number

// const client = twilio(accountSid, authToken);

// const db = admin.database();


// app.post("/set-notification", async (req, res) => {
//     const { phoneNumber, message, time } = req.body;

//     if (!phoneNumber || !message || !time) {
//         return res.status(400).json({ success: false, error: "Missing required fields!" });
//     }

//     try {
//         const notificationsRef = db.ref("notifications").push();
//         await notificationsRef.set({
//             phoneNumber,
//             message,
//             time,  // Store in HH:mm format (24-hour)
//         });

//         res.json({ success: true, message: "Notification scheduled successfully!" });
//     } catch (error) {
//         console.error("Error saving notification:", error);
//         res.status(500).json({ success: false, error: error.message });
//     }
// });


// exports.sendScheduledMessages = functions.pubsub.schedule("every 1 minutes").onRun(async (context) => {
//     const now = new Date();
//     const currentTime = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

//     try {
//         const snapshot = await db.ref("notifications").once("value");
//         const notifications = snapshot.val();

//         if (!notifications) return null;

//         Object.keys(notifications).forEach(async (userId) => {
//             const { phoneNumber, message, time } = notifications[userId];

//             if (time === currentTime) {
//                 console.log(`Sending reminder to ${phoneNumber} at ${time}`);

//                 try {
//                     await client.messages.create({
//                         body: message,
//                         from: twilioPhoneNumber,
//                         to: phoneNumber,
//                     });

//                     console.log("Message sent successfully!");
//                 } catch (error) {
//                     console.error("Error sending message:", error);
//                 }
//             }
//         });

//         return null;
//     } catch (error) {
//         console.error("Error fetching notifications:", error);
//         return null;
//     }
// });


// app.post("/send-message", async (req, res) => {
//   console.log("📩 Incoming Request:", req.body); // Log full request data

//   const { phone, appointmentDetails } = req.body;

//   if (!phone || !appointmentDetails) {
//       return res.status(400).json({ success: false, error: "Missing phone number or appointment details!" });
//   }

//   try {
//       const messageBody = `
//       Your appointment is confirmed!
//       Consultant: ${appointmentDetails.consultantName}
//       Date: ${appointmentDetails.date}
//       Time: ${appointmentDetails.time}
//       Location: ${appointmentDetails.location}
//       Specialization: ${appointmentDetails.specialization}
//       Experience: ${appointmentDetails.experience} years
//       `;

//       const message = await client.messages.create({
//           body: messageBody,
//           from: twilioPhoneNumber,
//           to: phone,
//       });

//       console.log("✅ SMS Sent:", message.sid);
//       res.json({ success: true, message: "SMS sent successfully!" });
//   } catch (error) {
//       console.error("❌ Twilio Error:", error);
//       res.status(500).json({ success: false, error: error.message });
//   }
// });


// // Start the server
// app.listen(port, () => {
//     console.log(`🚀 Server running on http://localhost:${port}`);
//     console.log("Connected to DB!!")
// });







require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const twilio = require("twilio");

const admin = require("firebase-admin");
const functions = require("firebase-functions");
const cron = require("node-cron");

// Initialize Firebase Admin with Database URL from .env
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  databaseURL: process.env.DATABASE_URL // e.g., https://<your-project-id>.firebaseio.com
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
const db = admin.database();

/**
 * API endpoint to set a notification.
 */
app.post("/set-notification", async (req, res) => {
  const { phoneNumber, message, time } = req.body;

  if (!phoneNumber || !message || !time) {
    return res.status(400).json({ success: false, error: "Missing required fields!" });
  }

  try {
    const notificationsRef = db.ref("notifications").push();
    await notificationsRef.set({
      phoneNumber,
      message,
      time, // Stored in HH:mm format (24-hour)
    });

    res.json({ success: true, message: "Notification scheduled successfully!" });
  } catch (error) {
    console.error("Error saving notification:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Common handler to check scheduled notifications and send SMS.
 */
async function sendScheduledMessagesHandler() {
  // Get the current time in "HH:MM" format (using en-GB locale)
  const now = new Date();
  const currentTime = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  console.log(`⏰ Checking scheduled messages for ${currentTime}...`);

  try {
    const snapshot = await db.ref("notifications").once("value");
    const notifications = snapshot.val();

    if (!notifications) {
      console.log("📭 No scheduled notifications found.");
      return;
    }

    // Iterate over notifications
    await Promise.all(
      Object.keys(notifications).map(async (userId) => {
        const { phoneNumber, message, time } = notifications[userId];
        if (time === currentTime) {
          console.log(`📩 Sending reminder to ${phoneNumber} at ${time}`);
          try {
            await client.messages.create({
              body: message,
              from: twilioPhoneNumber,
              to: phoneNumber,
            });
            console.log("✅ SMS sent successfully!");
            // Optionally, remove the notification once sent
            await db.ref(`notifications/${userId}`).remove();
          } catch (error) {
            console.error("❌ Error sending SMS:", error);
          }
        }
      })
    );
  } catch (error) {
    console.error("❌ Error fetching notifications:", error);
  }
}

/**
 * Set up scheduled messaging:
 * - When running locally (USE_LOCAL_CRON=true), use node-cron.
 * - Otherwise (i.e. in Cloud Functions), export the scheduled function.
 */
if (process.env.USE_LOCAL_CRON === "true") {
  // Local scheduler using node-cron: runs every minute.
  cron.schedule("*/1 * * * *", async () => {
    await sendScheduledMessagesHandler();
  });
  console.log("Local cron job scheduled to run every 1 minute.");
} else {
  // Export as a Firebase Cloud Function (only active when deployed)
  exports.sendScheduledMessages = functions.pubsub
    .schedule("every 1 minutes")
    .timeZone("Asia/Kolkata") // Change to your preferred timezone
    .onRun(async (context) => {
      await sendScheduledMessagesHandler();
      return null;
    });
}

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
  console.log("Connected to DB!!");
});
