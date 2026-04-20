// ======= server.js =======
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();
const nodemailer = require("nodemailer");
const csv = require("csv-parser");
const fs = require("fs");
const os = require("os");
const path = require("path");
const PORT = process.env.PORT || 5000;
const cron = require('node-cron');
const multer = require('multer');
const crypto = require('crypto');
const tempUpload = multer({ dest: os.tmpdir() });
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
require("dotenv").config();
const memoryUpload = multer({ storage: multer.memoryStorage() });

const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });



const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { body, validationResult } = require('express-validator');


// ✅ ADDED: New Schema to track student academic status
const AcademicStatusSchema = new mongoose.Schema({
  barcode: { type: String, required: true, unique: true },
  year: { type: String, required: true }
});
const AcademicStatus = mongoose.model("AcademicStatus", AcademicStatusSchema);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 login requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many login attempts from this IP, please try again after 15 minutes." }
});


// Middleware setup
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/images', express.static(path.join(__dirname, 'images')));


// ✅ STEP 3: Initialize Socket.IO on the HTTP server

// ✅ STEP 4: Set up the connection event listener
io.on('connection', (socket) => {
  console.log('✅ A user connected via WebSocket');
  socket.on('disconnect', () => {
    console.log('❌ User disconnected');
  });
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URL, {
}).then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));




// Schemas

const AdminSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  // 👇 Add these fields

});




// server.js

const HodSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  department: { type: String, required: true },
  // isVerified: { type: Boolean, default: false },
  // otp: { type: String },
  // otpExpires: { type: Date }
});


const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const DepartmentSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true }, // e.g. "3"
  name: { type: String, required: true } // e.g. "Computer Science"
});

const DesignationSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true }, // e.g. "F", "L", "R"
  name: { type: String, required: true } // e.g. "Faculty", "Librarian", "Research Scholar"
});

const Department = mongoose.model("Department", DepartmentSchema);
const Designation = mongoose.model("Designation", DesignationSchema);

// in server.js, with your other schemas
const MessageSchema = new mongoose.Schema({
  senderEmail: { type: String, required: true },
  senderRole: { type: String, required: true }, // e.g., 'hod', 'principal'
  message: { type: String, required: true },
  isRead: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model("Message", MessageSchema);


const visitorSchema = new mongoose.Schema({
  name: String,
  barcode: String,
  email: String,
  mobile: String,
  department: String,
  year: String,
  photoUrl: String, // OR photoBase64: String
  faceEncoding: { type: [Number], default: [] }
});



const logSchema = new mongoose.Schema({
  barcode: String,
  name: String,
  department: String,
  year: String,
  designation: String,
  date: String,
  entryTime: { type: Date, default: Date.now },
  exitTime: Date,
});



const noticeSchema = new mongoose.Schema({
  text: String,
  timestamp: { type: Date, default: Date.now }
});
const Notice = mongoose.model('Notice', noticeSchema);
const Admin = mongoose.model("Admin", AdminSchema);
const Hod = mongoose.model("Hod", HodSchema);
const upload = multer({ storage });
const Visitor = mongoose.model('Visitor', visitorSchema);
const Log = mongoose.model('Log', logSchema);


const PrincipalSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true }
});

// Add this with your other Mongoose Models
const Principal = mongoose.model("Principal", PrincipalSchema);


const AssistantSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
});
const Assistant = mongoose.model("Assistant", AssistantSchema);

// Add this with your other security middleware (like isAdmin)
const isPrincipal = (req, res, next) => {
  if (req.user.role !== 'principal') {
    return res.status(403).json({ success: false, message: "Principal access required." });
  }
  next();
};

// ✅ ADDED: New middleware to check for Admin or Principal role
const isAdminOrPrincipal = (req, res, next) => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'principal') {
    return res.status(403).json({ message: "Access denied. Requires Admin or Principal role." });
  }
  next();
};

// ===================================================================
// START: AUTHENTICATION AND AUTHORIZATION MIDDLEWARE
// ===================================================================

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) {
    return res.sendStatus(401);
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    // ✅ ADD THIS LOG to see the specific JWT error
    if (err) {
      console.error("❌ JWT Verification Error:", err.message);
      return res.sendStatus(403);
    }
    req.user = user;
    next();
  });
};

const registrationValidationRules = () => [
  body('email').isEmail().withMessage('Please enter a valid email address.').normalizeEmail(),
  body('password').isStrongPassword({
    minLength: 8,
    minUppercase: 1,
    minNumbers: 1,
    minSymbols: 1
  }).withMessage('Password must be at least 8 characters long and contain an uppercase letter, a number, and a special character.')
];

// Specific rules for HOD registration (includes the rules above)
const hodRegistrationValidationRules = () => [
  ...registrationValidationRules(),
  body('department').trim().notEmpty().withMessage('Department is a required field.')
];

// Middleware to handle validation errors from any route
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }
  // To make the error message simple for the frontend, we'll just send the first one.
  const firstError = errors.array()[0].msg;
  return res.status(400).json({ message: firstError });
};

// Middleware to check if the user is an admin
// Middleware to check if the user is an admin
const isAdmin = (req, res, next) => {
  // ✅ ADD THIS LOG to check the user's role before validation
  console.log("ℹ️ isAdmin Middleware Check - User Role:", req.user?.role);

  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, message: "Admin access required. User does not have the 'admin' role." });
  }
  next();
};

// Middleware to check if the user is an HOD
const isHod = (req, res, next) => {
  if (req.user.role !== 'hod') {
    return res.status(403).json({ success: false, message: "HOD access required." });
  }
  next();
};

app.post('/api/admin/upload-failed-list', authenticateToken, isAdmin, memoryUpload.single('failedListCsv'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No CSV file uploaded." });
  }

  const failedNames = [];
  const fileBuffer = req.file.buffer.toString('utf-8');
  const readableStream = require('stream').Readable.from(fileBuffer);

  readableStream
    .pipe(csv({ mapHeaders: ({ header }) => header.trim().toLowerCase() }))
    .on('data', (row) => {
      // Check if the 'name' column exists and has a value, then trim and add to the list
      if (row.name) {
        failedNames.push(row.name.trim());
      } else {
        console.warn("⚠️ Skipping a row in the CSV because the 'name' column is missing or empty.");
      }
    })
    .on('end', async () => {
      try {
        // Find all visitors who match the names in the CSV to get their barcodes
        // We use a flexible regex to handle name order variations
        const searchConditions = failedNames.map(name => {
          const nameParts = name.split(/\s+/).filter(Boolean);
          const regexParts = nameParts.map(part => new RegExp(part, 'i'));
          return { $and: regexParts.map(regex => ({ name: regex })) };
        });

        let failedVisitors = [];
        if (searchConditions.length > 0) {
          failedVisitors = await Visitor.find({ $or: searchConditions });
        }

        const failedBarcodes = failedVisitors.map(v => v.barcode);
        const failedBarcodesSet = new Set(failedBarcodes);

        // Get ALL student statuses from the database
        const allStudentStatuses = await AcademicStatus.find({});
        const studentUpdates = [];

        const yearOrder = ["First Year", "Second Year", "Third Year", "Final Year", "Graduated"];
        const yearMap = new Map(yearOrder.map((year, index) => [year, yearOrder[index + 1]]));

        // Prepare updates only for the students who passed (i.e., not in the failed list)
        for (const student of allStudentStatuses) {
          if (!failedBarcodesSet.has(student.barcode)) {
            // If student is not on the failed list, promote them
            const nextYear = yearMap.get(student.year) || student.year;
            if (nextYear !== student.year) {
              studentUpdates.push({
                updateOne: {
                  filter: { barcode: student.barcode },
                  update: { $set: { year: nextYear } }
                }
              });
            }
          }
          // If the student is on the failed list, we do nothing, so they stay in their current year.
        }

        let promotedCount = 0;
        if (studentUpdates.length > 0) {
          const result = await AcademicStatus.bulkWrite(studentUpdates);
          promotedCount = result.modifiedCount;
        }

        res.status(200).json({
          success: true,
          message: `Academic year status updated. ${promotedCount} students have been promoted. ${failedNames.length} students have been held back.`
        });

      } catch (error) {
        console.error("❌ Error processing failed list:", error);
        res.status(500).json({ message: "Server error during academic update." });
      }
    });
});

app.get('/api/admin/fix-academic-statuses', authenticateToken, isAdmin, async (req, res) => {
  try {
    const allVisitors = await Visitor.find({}).select('barcode');
    const existingStatuses = await AcademicStatus.find({}).select('barcode');
    const existingBarcodes = new Set(existingStatuses.map(s => s.barcode));

    // This maps over all visitors to find those that are students and don't yet have an academic status entry.
    const missingStatuses = allVisitors
      .map(v => {
        const decoded = decodeBarcode(v.barcode);
        return { barcode: v.barcode, year: decoded.year, isStudent: decoded.designation === "Student" };
      })
      .filter(v => v.isStudent && v.barcode && !existingBarcodes.has(v.barcode));

    if (missingStatuses.length === 0) {
      return res.send("All visitors already have an academic status. No fix needed.");
    }

    // Create new academic status records with the correct initial year.
    const newStatuses = missingStatuses.map(v => ({ barcode: v.barcode, year: v.year }));
    await AcademicStatus.insertMany(newStatuses, { ordered: false });

    res.send(`Successfully created ${newStatuses.length} missing academic status records. You can now run the promotion update.`);
  } catch (error) {
    res.status(500).send("An error occurred: " + error.message);
  }
});

async function decodeBarcode(barcode) {
  const unknownResult = {
    year: "N/A",
    department: "Unknown",
    designation: "Unknown",
  };

  if (!barcode || typeof barcode !== "string" || barcode.length < 5) {
    return unknownResult;
  }

  const designationPrefix = barcode.charAt(0).toUpperCase();
  let designation = "Unknown";
  let department = "Unknown";
  let year = "N/A";

  // ✅ Lookup designation
  const designationDoc = await Designation.findOne({ code: designationPrefix });
  if (designationDoc) designation = designationDoc.name;

  // ✅ Faculty / Librarian / Research Scholar
  if (designation !== "Unknown" && designation !== "Student") {
    const deptCode = barcode.charAt(3);
    const deptDoc = await Department.findOne({ code: deptCode });
    department = deptDoc ? deptDoc.name : "Unknown";
    return { year, department, designation };
  }

  // ✅ Student
  if (!isNaN(parseInt(designationPrefix, 10))) {
    designation = "Student";
    const admissionYearCode = barcode.slice(0, 2); // e.g. "22"
    const deptCode = barcode.charAt(2);
    const enrollTypeCode = barcode.slice(3, 5);
    studentId = barcode.slice(5);

    // find department dynamically
    const deptDoc = await Department.findOne({ code: deptCode });
    department = deptDoc ? deptDoc.name : "Unknown";

    // academic year logic
    const now = new Date();
    let currentAcademicYear = now.getFullYear() % 100;
    if (now.getMonth() < 6) currentAcademicYear--;

    const yearsSinceAdmission = currentAcademicYear - parseInt(admissionYearCode, 10);

    if (enrollTypeCode === "10") {
        // M: Corrected logic to handle future and current students
        if (yearsSinceAdmission <= 0)      year = "First Year";
        else if (yearsSinceAdmission === 1) year = "Second Year";
        else if (yearsSinceAdmission === 2) year = "Third Year";
        else if (yearsSinceAdmission === 3) year = "Final Year";
        else                                year = "Graduated"; // Handles yearsSinceAdmission >= 4
    } else if (enrollTypeCode === "20") {
        // M: Corrected logic for DSY students
        if (yearsSinceAdmission <= 0)      year = "Second Year";
        else if (yearsSinceAdmission === 1) year = "Third Year";
        else if (yearsSinceAdmission === 2) year = "Final Year";
        else                                year = "Graduated"; // Handles yearsSinceAdmission >= 3
    }
  }

  return { year, department, designation };
}



// in server.js

async function decodeBarcodeWithPromotion(barcode) {
  // Get the base year from the pure decodeBarcode function
  // ✅ CORRECTED: Added the missing 'await' keyword here.
  const decoded = await decodeBarcode(barcode);

  // Only apply promotion logic to students
  if (decoded.designation !== "Student") {
    return decoded;
  }

  // Find the student's academic status from the database
  const status = await AcademicStatus.findOne({ barcode: barcode });

  // Use the year from the database if it exists, otherwise fall back to the calculated year
  if (status && status.year) {
    decoded.year = status.year;
  }

  return decoded;
}

function getCurrentDateString() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

app.post('/scan', async (req, res) => {
  const barcode = req.body?.barcode;
  if (!barcode) {
    return res.status(400).json({ error: 'Invalid or missing barcode' });
  }
  try {
    const visitor = await Visitor.findOne({ barcode });
    if (!visitor) {
      return res.status(404).json({ error: 'Visitor not found' });
    }

    const today = new Date().toISOString().split('T')[0];
    const existingLog = await Log.findOne({ barcode, exitTime: null, date: today });

    const decoded = await decodeBarcodeWithPromotion(barcode);
    let savedLog;

    if (existingLog) {
      existingLog.exitTime = new Date();
      savedLog = await existingLog.save();
    } else {
      const newEntry = new Log({
        barcode,
        name: visitor.name,
        department: decoded.department,
        year: decoded.year,
        designation: decoded.designation,
        date: today,
      });
      savedLog = await newEntry.save();
    }

    io.emit('logUpdate');

    return res.status(200).json({
      status: existingLog ? "exit" : "entry",
      ...savedLog._doc,
      photoUrl: visitor.photoUrl
    });

  } catch (error) {
    console.error("Scan error:", error);
    return res.status(500).json({ error: 'Server error' });
  }
});


app.get('/live-log', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const logs = await Log.find({ date: today }).sort({ entryTime: -1 });
    return res.status(200).json(logs);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch live log' });
  }
});

// New endpoint to support analysis.js — returns all logs
app.get('/all-logs', async (req, res) => {
  try {
    const logs = await Log.find().sort({ entryTime: -1 });
    res.status(200).json(logs);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch all logs" });
  }
});

app.get('/stats', async (req, res) => {
  try {
    const today = getCurrentDateString();

    const todayLogs = await Log.find({ date: today });

    const totalVisitorsToday = todayLogs.length;
    const currentlyInside = todayLogs.filter(log => !log.exitTime).length;

    const deptCount = {};
    todayLogs.forEach(log => {
      if (log.department) {
        deptCount[log.department] = (deptCount[log.department] || 0) + 1;
      }
    });

    const mostFrequentDept = Object.entries(deptCount)
      .sort((a, b) => b[1] - a[1])[0]?.[0];

    const latestEntry = todayLogs
      .sort((a, b) => new Date(b.entryTime) - new Date(a.entryTime))[0];

    const lastEntry = latestEntry
      ? new Date(latestEntry.entryTime).toLocaleTimeString()
      : null;

    res.status(200).json({
      totalVisitorsToday,
      currentlyInside,
      mostFrequentDept,
      lastEntry
    });
  } catch (err) {
    console.error("Error generating stats:", err);
    res.status(500).json({ error: "Failed to generate stats" });
  }
});

let autoExitTask = null; // This will hold our scheduled task
let AUTO_EXIT_HOUR = 21; // Default: 9 PM IST
let AUTO_EXIT_MINUTE = 0; // Default: 0 minutes

// Function to stop the old task and start a new one with the updated time
function scheduleAutoExit() {
  // If an old task exists, stop it before creating a new one
  if (autoExitTask) {
    autoExitTask.stop();
    console.log('[CRON SCHEDULER] Stopped previous auto-exit task.');
  }

  // This format means the job will run at the specific minute and hour, every day.
  const cronSchedule = `${AUTO_EXIT_MINUTE} ${AUTO_EXIT_HOUR} * * *`;

  // Create the new scheduled task with the India time zone
  autoExitTask = cron.schedule(cronSchedule, async () => {
    const now = new Date();
    console.log(`[CRON SCHEDULER] ✅ Auto-exit triggered at ${now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST.`);

    // --- NEW: Define the date range for ONLY TODAY ---
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0); // Set to the very beginning of today

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999); // Set to the very end of today
    // --- END NEW ---

    try {
      // ✅ MODIFIED QUERY: This now only targets users who entered TODAY and haven't exited.
      const result = await Log.updateMany(
        {
          entryTime: { $gte: startOfToday, $lte: endOfToday }, // Condition 1: Entry was today
          exitTime: null                                      // Condition 2: Still inside
        },
        { $set: { exitTime: now } } // Set their exit time to now
      );

      console.log(`[CRON SCHEDULER] 🕘 Success: ${result.modifiedCount} of today's open entries were closed.`);
    } catch (err) {
      console.error("[CRON SCHEDULER] ❌ Auto-exit task failed:", err);
    }
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata" // Ensures the scheduler runs on India time
  });

  console.log(`[CRON SCHEDULER] 🚀 Auto-exit job scheduled to run daily at ${AUTO_EXIT_HOUR}:${String(AUTO_EXIT_MINUTE).padStart(2, '0')} IST.`);
}

// Admin: update auto-exit time (This endpoint remains the same)
app.post('/admin/auto-exit', authenticateToken, isAdmin, (req, res) => {
  const { hour, minute } = req.body;
  
  if (hour === undefined || minute === undefined || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return res.status(400).json({ success: false, message: "A valid hour (0-23) and minute (0-59) are required." });
  }

  AUTO_EXIT_HOUR = parseInt(hour);
  AUTO_EXIT_MINUTE = parseInt(minute);
  
  // Reschedule the job with the new time
  scheduleAutoExit();
  
  return res.status(200).json({ success: true, message: `Auto-exit time successfully updated to ${AUTO_EXIT_HOUR}:${String(AUTO_EXIT_MINUTE).padStart(2, '0')} IST.` });
});


// Call the function once on server startup to schedule the initial default job
scheduleAutoExit();

// ===================================================================
// END: AUTO-EXIT SCHEDULER
// ===================================================================

// Admin: force exit manually
app.post('/admin/force-exit', authenticateToken, isAdmin, async (req, res) => {
  try {
    const now = new Date();

    // Create a date range for the current day (from midnight to midnight)
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const result = await Log.updateMany(
      // The new, more reliable filter:
      // Find logs where entry time was today AND exit time is not set.
      {
        entryTime: { $gte: startOfToday, $lte: endOfToday },
        exitTime: null
      },
      // Set the exit time to now
      { $set: { exitTime: now } }
    );

    return res.status(200).json({ message: "Force exit completed.", modifiedCount: result.modifiedCount });
  } catch (err) {
    console.error("❌ Manual force exit failed:", err);
    return res.status(500).json({ error: "Manual exit failed." });
  }
});

app.post('/admin/notices', authenticateToken, isAdmin, async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Notice text required' });

  try {
    const newNotice = new Notice({ text });
    await newNotice.save();
    res.status(201).json({ success: true, message: 'Notice posted successfully' });
  } catch (err) {
    console.error('Failed to save notice:', err);
    res.status(500).json({ success: false, error: 'Failed to save notice' });
  }
});

// Notice GET API (Public - No Login Required)
app.get('/notices', async (req, res) => {
  try {
    const notices = await Notice.find().sort({ timestamp: -1 }).limit(5);
    res.status(200).json(notices);
  } catch (err) {
    console.error('Failed to fetch notices:', err);
    res.status(500).json({ error: 'Failed to load notices' });
  }
});

// Admin: Delete a notice (Requires Admin Login)
app.delete('/admin/notices/:id', authenticateToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await Notice.findByIdAndDelete(id);
    res.status(200).json({ success: true, message: "Notice deleted successfully" });
  } catch (err) {
    console.error("Failed to delete notice:", err);
    res.status(500).json({ success: false, message: "Failed to delete notice" });
  }
});

// in server.js

// Change this line from 'upload.single' to 'memoryUpload.single'
app.post('/upload-photo', memoryUpload.single('photo'), authenticateToken, isAdmin, async (req, res) => {
  const barcode = req.body.barcode;
  if (!barcode || !req.file) {
    return res.status(400).json({ success: false, message: 'Barcode and photo required.' });
  }

  try {
    const photoUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

    const visitor = await Visitor.findOneAndUpdate(
      { barcode },
      { $set: { photoUrl } },
      { new: true }
    );

    if (!visitor) {
      return res.status(404).json({ success: false, message: 'Visitor not found.' });
    }

    res.status(200).json({ success: true, message: 'Photo uploaded and linked to barcode.' });
  } catch (error) {
    console.error('Error uploading photo:', error);
    res.status(500).json({ success: false, message: 'Server error during photo upload.' });
  }
});

// And change this line from 'upload.array' to 'memoryUpload.array'
app.post('/bulk-upload-photos', memoryUpload.array('photos', 500), authenticateToken, isAdmin, async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No photos uploaded.' });
    }

    console.log('✅ Received files:', req.files.length);

    let uploadedCount = 0;

    for (const file of req.files) {
      // The filename (without extension) is treated as the barcode
      const filenameWithoutExtension = file.originalname.split('.').slice(0, -1).join('.');
      const barcode = filenameWithoutExtension.trim();

      if (!barcode) continue; // Skip if barcode is empty

      // Convert the file buffer to a base64 string
      const photoUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;

      // Find an existing visitor or create a new one
      let visitor = await Visitor.findOne({ barcode });

      if (!visitor) {
        // If visitor doesn't exist, you might want to create a placeholder
        visitor = new Visitor({ barcode, name: "Unknown", photoUrl });
      } else {
        visitor.photoUrl = photoUrl;
      }

      await visitor.save();
      uploadedCount++;
    }

    return res.status(200).json({ success: true, uploadedCount });
  } catch (err) {
    console.error('❌ Server error during bulk upload:', err);
    return res.status(500).json({ success: false, message: 'Server error during upload.' });
  }
});

app.get('/students', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;
  const search = req.query.search?.toLowerCase() || "";
  const sortByName = parseInt(req.query.sortByName) || 1;
  const sortObject = { name: sortByName };

  try {
    const query = search
      ? { $or: [{ name: { $regex: search, $options: "i" } }, { barcode: { $regex: search, $options: "i" } }] }
      : {};

    const total = await Visitor.countDocuments(query);
    const visitors = await Visitor.find(query).sort(sortObject).skip(skip).limit(limit);

    // --- OPTIMIZATION START ---
    // 1. Collect all barcodes from the current page of visitors.
    const visitorBarcodes = visitors.map(v => v.barcode);

    // 2. Fetch all academic statuses for these visitors in a single query.
    const academicStatuses = await AcademicStatus.find({ barcode: { $in: visitorBarcodes } });
    
    // 3. Create a Map for instant lookups (barcode -> year).
    const academicStatusMap = new Map(academicStatuses.map(s => [s.barcode, s.year]));
    // --- OPTIMIZATION END ---

    // Now, map the results without causing more database calls.
    const students = await Promise.all(visitors.map(async (visitor) => {
      const decoded = await decodeBarcode(visitor.barcode || "");
      
      // Use the year from our Map if it exists, otherwise use the calculated year.
      const finalYear = academicStatusMap.get(visitor.barcode) || decoded.year;

      return {
        name: visitor.name || "No Name",
        barcode: visitor.barcode || "No Barcode",
        photoBase64: visitor.photoUrl || null,
        department: decoded.department || "Unknown",
        year: finalYear || "Unknown",
        email: visitor.email || "N/A",
        mobile: visitor.mobile || "N/A"
      };
    }));

    res.status(200).json({
      students,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    });
  } catch (err) {
    console.error("❌ Error in /students:", err);
    res.status(500).json({ error: "Server error" });
  }
});
// ===================================================================
// START: NEW ENDPOINTS FOR UPDATING A VISITOR
// ===================================================================



// GET a single student by barcode
app.get('/api/students/:barcode', async (req, res) => {
  try {
    const { barcode } = req.params;
    const student = await Visitor.findOne({ barcode });

    if (!student) {
      return res.status(404).json({ success: false, message: "Visitor not found" });
    }

    res.status(200).json({ success: true, student });
  } catch (err) {
    console.error("❌ Error fetching visitor:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});



app.put("/api/students/:barcode", authenticateToken, isAdmin, memoryUpload.single('photo'), async (req, res) => {
  try {
    const { barcode } = req.params;
    const updateData = {
      name: req.body.name,
      email: req.body.email,
      mobile: req.body.mobile
    };
    if (req.file) {
      updateData.photoUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }
    const updated = await Visitor.findOneAndUpdate(
      { barcode },
      { $set: updateData },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ success: false, message: "Visitor not found" });
    }
    res.json({ success: true, message: "Visitor updated successfully.", student: updated });
  } catch (err) {
    console.error("❌ Error updating visitor:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// DELETE a visitor by barcode
app.delete('/api/students/:barcode', async (req, res) => {
  const { barcode } = req.params;
  console.log("🔍 DELETE request for barcode:", barcode);

  try {
    const deleted = await Visitor.findOneAndDelete({ barcode });

    if (!deleted) {
      console.log("❌ Visitor not found for deletion");
      return res.status(404).json({ success: false, message: "Visitor not found" });
    }

    console.log("✅ Visitor deleted:", deleted.name);
    res.status(200).json({ success: true, message: "Visitor deleted successfully" });
  } catch (err) {
    console.error("❌ Server error during deletion:", err);
    res.status(500).json({ success: false, message: "Server error during deletion" });
  }
});





// ===================================================================
// END: NEW ENDPOINTS FOR UPDATING A VISITOR
// ===================================================================


app.get('/debug-visitors', async (req, res) => {
  try {
    const data = await Visitor.find({}).limit(5);
    console.log("🧾 Sample raw visitors:", data);
    res.status(200).json(data);
  } catch (err) {
    console.error("❌ Error in /debug-visitors:", err);
    res.status(500).json({ error: "Failed to load visitors" });
  }
});

app.get('/photo/:barcode', async (req, res) => {
  console.log("▶️ Request for photo:", req.params.barcode);
  const visitor = await Visitor.findOne({ barcode: req.params.barcode });
  console.log("🔍 Visitor found:", visitor);

  if (!visitor || !visitor.photoUrl || !visitor.photoUrl.startsWith('data:image')) {
    console.log("❌ Invalid photoUrl. Sending default image.");
    return res.sendFile(__dirname + '/Backend/public/images/default.jpg');
  }

  const match = visitor.photoUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) {
    console.log("❌ Base64 match failed. Sending default image.");
    return res.sendFile(__dirname + '/Backend/public/images/default.jpg');
  }

  const mimeType = match[1];
  const base64Data = match[2];
  const buffer = Buffer.from(base64Data, 'base64');

  res.setHeader('Content-Type', mimeType);
  res.send(buffer);
});



const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

app.post('/face-entry', async (req, res) => {
  try {
    // 📧 Send Email
    try {
      const email = visitor.email || "default.email@example.com";
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: "Entry Log Notification",
        text: `${actionMessage} on ${today}`
      });
      console.log(`📧 Email sent to ${email}`);
    } catch (emailErr) {
      console.error("❌ Email error:", emailErr.message);
    }
  } catch (error) {
    console.error("❌ entry error:", error);
  }
});

app.get('/api/monthly-awards', async (req, res) => {
  try {
    const now = new Date();
    // Use query parameters if provided, otherwise default to the current month and year
    const year = req.query.year ? parseInt(req.query.year) : now.getFullYear();
    // Note: JS months are 0-indexed (Jan=0), so we subtract 1 from the provided month
    const month = req.query.month ? parseInt(req.query.month) - 1 : now.getMonth();

    const startOfMonth = new Date(year, month, 1);
    const endOfMonth = new Date(year, month + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999); // Ensure it includes the entire last day

    const rankings = await Log.aggregate([
      // 1. Filter for logs within the current month that are completed (have an exit time)
      {
        $match: {
          entryTime: { $gte: startOfMonth, $lte: endOfMonth },
          exitTime: { $exists: true, $ne: null }
        }
      },
      // 2. Group by student barcode
      {
        $group: {
          _id: "$barcode", // Group by the visitor's barcode
          totalDuration: {
            $sum: { $subtract: ["$exitTime", "$entryTime"] } // Sum the duration of all visits in milliseconds
          },
          uniqueDays: {
            $addToSet: { $dateToString: { format: "%Y-%m-%d", date: "$entryTime" } } // Count unique days visited
          }
        }
      },
      // 3. Join with the visitors collection to get student names
      {
        $lookup: {
          from: "visitors", // The actual name of the visitors collection in MongoDB
          localField: "_id",
          foreignField: "barcode",
          as: "visitorInfo"
        }
      },
      // 4. Unwind the visitorInfo array to make it an object
      {
        $unwind: "$visitorInfo"
      },
      // 5. Sort by total duration descending
      {
        $sort: {
          totalDuration: -1
        }
      },
      // 6. Add a field for the count of unique days
      {
        $addFields: {
          uniqueDaysCount: { $size: "$uniqueDays" }
        }
      }
    ]);

    // Format the duration from milliseconds to a human-readable string
    const formattedRankings = rankings.map(r => {
      const totalSeconds = Math.floor(r.totalDuration / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      return {
        ...r,
        totalDurationFormatted: `${hours} hours, ${minutes} minutes, ${seconds} seconds`,
      };
    });

    // Find the consistency winner (most unique days)
    const consistencyWinner = [...formattedRankings].sort((a, b) => b.uniqueDaysCount - a.uniqueDaysCount)[0];

    res.status(200).json({
      topScholars: formattedRankings,
      consistencyWinner: consistencyWinner
    });

  } catch (error) {
    console.error("❌ Error calculating monthly awards:", error);
    res.status(500).json({ message: "Server error while calculating awards." });
  }
});


app.post('/add-visitor', authenticateToken, isAdmin, memoryUpload.single('photo'), async (req, res) => {
  const { barcode, name, mobile, email } = req.body;
  const file = req.file;
  try {
    const photoUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    const newVisitor = new Visitor({ barcode, name, mobile, email, photoUrl });
    await newVisitor.save();

    // Also create a default academic status record for the new student
    const decoded = await decodeBarcode(barcode); //  M: Added await
    const newStatus = new AcademicStatus({ barcode, year: decoded.year });
    await newStatus.save();

    res.status(200).json({ message: "✅ Visitor added successfully!" });
  } catch (err) {
    // If a visitor with the same barcode exists, the academic status might also exist. Handle this gracefully.
    if (err.code === 11000) { // Duplicate key error
      console.warn(`Visitor with barcode ${barcode} may already exist.`);
      return res.status(409).json({ message: `Visitor with barcode ${barcode} already exists.` });
    }
    console.error("Error saving visitor:", err); // M: Added detailed error logging
    res.status(500).json({ message: "❌ Error saving visitor." });
  }
});

app.post('/bulk-add-visitors', tempUpload.fields([{ name: "csv" }, { name: "photos" }]), async (req, res) => {
  try {
    const csvFile = req.files["csv"]?.[0];
    const photoFiles = req.files["photos"] || [];

    if (!csvFile) {
      return res.status(400).json({ success: false, message: "CSV file is missing." });
    }

    const photoMap = {};
    if (photoFiles.length > 0) {
      photoFiles.forEach(file => {
        const key = path.parse(file.originalname).name.trim().toLowerCase();
        photoMap[key] = `data:${file.mimetype};base64,${fs.readFileSync(file.path).toString('base64')}`;
      });
    }

    const recordsToInsert = [];

    fs.createReadStream(csvFile.path)
      .pipe(csv({
        trim: true,
        bom: true,
        mapHeaders: ({ header }) => header.trim().toLowerCase()
      }))
      .on("data", (row) => {
        const { barcode, name, mobile, email } = row;
        if (!barcode || !name) {
          console.warn(`[Bulk Upload] ⚠️ SKIPPING ROW: The 'barcode' and 'name' columns are required. Found barcode: '${barcode}', name: '${name}'.`);
          return;
        }
        const photoUrl = photoMap[barcode.toLowerCase()] || null;
        if (!photoUrl) {
          console.info(`[Bulk Upload] ℹ️ INFO: No photo found for barcode '${barcode}'. Adding visitor without photo.`);
        }
        recordsToInsert.push({
          barcode,
          name,
          mobile: mobile || '',
          email: email || '',
          photoUrl: photoUrl
        });
      })
      .on("end", async () => {
        try {
          if (recordsToInsert.length > 0) {
            const result = await Visitor.insertMany(recordsToInsert, { ordered: false }).catch(e => {
              if (e.code !== 11000) throw e;
              console.warn("Some visitors were duplicates and were skipped.");
            });
            const insertedCount = result ? result.length : recordsToInsert.length;

            // M: Asynchronously decode barcodes and create academic status records
            const statusPromises = recordsToInsert.map(async (v) => {
              const decoded = await decodeBarcode(v.barcode);
              return {
                barcode: v.barcode,
                year: decoded.year
              };
            });
            const statusRecords = await Promise.all(statusPromises);

            await AcademicStatus.insertMany(statusRecords, { ordered: false }).catch(e => {
              if (e.code !== 11000) throw e;
              console.warn("Some academic status records already existed and were skipped.");
            });

            console.log(`[Bulk Upload] ✅ Successfully processed ${insertedCount} new visitors and their academic statuses.`);
            res.status(200).json({ success: true, message: `Successfully added ${insertedCount} visitors.` });
          } else {
            res.status(200).json({ success: true, message: "0 visitors were added. Please check the server console for warnings." });
          }
        } catch (dbError) {
          console.error("❌ Database error during bulk insert:", dbError);
          res.status(500).json({ success: false, message: "A database error occurred during the bulk insert." });
        }
      });
  } catch (err) {
    console.error("❌ General error in bulk upload:", err);
    res.status(500).json({ success: false, message: "A server error occurred." });
  }
});

// Register Admin
app.post("/api/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required." });
    }

    const existing = await Admin.findOne({ email });
    if (existing) {
      return res.status(409).json({ success: false, message: "An account with this email already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newAdmin = new Admin({ email, password: hashedPassword });
    await newAdmin.save();

    res.status(201).json({ success: true, message: "Registered successfully" });

  } catch (err) {
    // ✅ IMPROVED LOGGING: This will now print the specific database or code error.
    console.error("❌ Registration error:", err);
    res.status(500).json({ success: false, message: "Server error during registration" });
  }
});


app.post("/api/register-hod", async (req, res) => {
  try {
    const { email, password, department } = req.body;

    if (!email || !password || !department) {
      return res.status(400).json({ success: false, message: "All fields are required." });
    }

    const existingHod = await Hod.findOne({ email });
    if (existingHod) {
      return res.status(409).json({ success: false, message: "HOD with this email already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newHod = new Hod({
      email,
      password: hashedPassword,
      department,

    });

    await newHod.save();
    res.status(201).json({ success: true, message: "HOD registered successfully." });

  } catch (err) {
    console.error("❌ HOD registration error:", err);
    res.status(500).json({ success: false, message: "Server error during HOD registration." });
  }
});



// Password Reset for Admin
app.post("/api/reset-password", async (req, res) => {
  const { email, currentPassword, newPassword } = req.body;

  if (!email || !currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: "All fields are required." });
  }

  try {
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(404).json({ success: false, message: "Account not found." });
    }

    const isMatch = await bcrypt.compare(currentPassword, admin.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Incorrect current password." });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    admin.password = hashedNewPassword;
    await admin.save();

    res.status(200).json({ success: true, message: "Password updated successfully!" });
  } catch (err) {
    console.error("❌ Password reset error:", err);
    res.status(500).json({ success: false, message: "Server error during password reset." });
  }
});


app.post("/api/register-hod", async (req, res) => {
  try {
    const { email, password, department } = req.body;

    // ✅ Validate fields
    if (!email || !password || !department) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    // ✅ Check if HOD already exists
    const existingHod = await User.findOne({ email });
    if (existingHod) {
      return res.status(400).json({ success: false, message: "HOD already exists with this email" });
    }

    // ✅ Hash password and save
    const hashedPassword = await bcrypt.hash(password, 10);
    const newHod = new User({
      email,
      password: hashedPassword,
      role: "hod",
      department
    });

    await newHod.save();

    res.json({ success: true, message: "HOD registered successfully" });

  } catch (err) {
    console.error("❌ Register HOD Error:", err);
    res.status(500).json({ success: false, message: "Server error during HOD registration" });
  }
});

app.post("/api/hod-initial-reset", async (req, res) => {
  const { email, newPassword } = req.body;
  if (!email || !newPassword) {
    return res.status(400).json({ success: false, message: "Email and new password are required." });
  }

  try {
    const hod = await Hod.findOne({ email });
    if (!hod) {
      return res.status(404).json({ success: false, message: "HOD account not found." });
    }

    // Only allow this if a reset is actually required
    if (!hod.passwordResetRequired) {
      return res.status(403).json({ success: false, message: "Password has already been set." });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    hod.password = hashedNewPassword;
    hod.passwordResetRequired = false; // The crucial step
    await hod.save();

    res.status(200).json({ success: true, message: "Password has been set successfully. Please log in again." });
  } catch (err) {
    console.error("❌ HOD initial reset error:", err);
    res.status(500).json({ success: false, message: "Server error during password reset." });
  }
});

// server.js

app.post("/api/hod/verify-login", async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: "Email and OTP are required." });
    }

    // Find the HOD and validate the OTP
    const hod = await Hod.findOne({
      email,
      otp,
      otpExpires: { $gt: Date.now() } // Check that OTP is not expired
    });

    if (!hod) {
      return res.status(400).json({ success: false, message: "Invalid or expired verification code." });
    }

    // If OTP is correct, update the account to be verified

    // Now, generate the standard login token
    const token = jwt.sign(
      { id: hod._id, role: 'hod', department: hod.department },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    // ✅ UPDATED: Added department to the response
    res.status(200).json({ success: true, token, department: hod.department, message: "Verification successful. You are now logged in." });

  } catch (err) {
    console.error("❌ HOD Login Verification Error:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
});



// GET all HODs (Admin only)
app.get("/api/hods", authenticateToken, isAdmin, async (req, res) => {
  try {
    const hods = await Hod.find({}).select("-password -otp -otpExpires"); // Exclude sensitive fields
    res.status(200).json(hods);
  } catch (error) {
    res.status(500).json({ message: "Server error fetching HODs." });
  }
});

// UPDATE an HOD by ID (Admin only)
app.put("/api/hods/:id", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = params;
    const { email, department } = req.body;

    const updatedHod = await Hod.findByIdAndUpdate(
      id,
      { email, department },
      { new: true, runValidators: true }
    );

    if (!updatedHod) {
      return res.status(404).json({ message: "HOD not found." });
    }
    res.status(200).json({ message: "HOD updated successfully.", hod: updatedHod });
  } catch (error) {
    res.status(500).json({ message: "Server error updating HOD." });
  }
});

// DELETE an HOD by ID (Admin only)
app.delete("/api/hods/:id", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const deletedHod = await Hod.findByIdAndDelete(id);

    if (!deletedHod) {
      return res.status(404).json({ message: "HOD not found." });
    }
    res.status(200).json({ message: "HOD deleted successfully." });
  } catch (error) {
    res.status(500).json({ message: "Server error deleting HOD." });
  }
});


app.get('/api/monthly-awards', async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const rankings = await Log.aggregate([
      // 1. Filter for logs within the current month that are completed (have an exit time)
      {
        $match: {
          entryTime: { $gte: startOfMonth, $lte: endOfMonth },
          exitTime: { $exists: true, $ne: null }
        }
      },
      // 2. Group by student barcode
      {
        $group: {
          _id: "$barcode", // Group by the visitor's barcode
          totalDuration: {
            $sum: { $subtract: ["$exitTime", "$entryTime"] } // Sum the duration of all visits in milliseconds
          },
          uniqueDays: {
            $addToSet: { $dateToString: { format: "%Y-%m-%d", date: "$entryTime" } } // Count unique days visited
          }
        }
      },
      // 3. Join with the visitors collection to get student names
      {
        $lookup: {
          from: "visitors", // The actual name of the visitors collection in MongoDB
          localField: "_id",
          foreignField: "barcode",
          as: "visitorInfo"
        }
      },
      // 4. Unwind the visitorInfo array to make it an object
      {
        $unwind: "$visitorInfo"
      },
      // 5. Sort by total duration descending
      {
        $sort: {
          totalDuration: -1
        }
      },
      // 6. Add a field for the count of unique days
      {
        $addFields: {
          uniqueDaysCount: { $size: "$uniqueDays" }
        }
      }
    ]);

    // Format the duration from milliseconds to a human-readable string
    const formattedRankings = rankings.map(r => {
      const totalSeconds = Math.floor(r.totalDuration / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      return {
        ...r,
        totalDurationFormatted: `${hours} hours, ${minutes} minutes, ${seconds} seconds`,
      };
    });

    // Find the consistency winner (most unique days)
    const consistencyWinner = [...formattedRankings].sort((a, b) => b.uniqueDaysCount - a.uniqueDaysCount)[0];

    res.status(200).json({
      topScholars: formattedRankings,
      consistencyWinner: consistencyWinner
    });

  } catch (error) {
    console.error("❌ Error calculating monthly awards:", error);
    res.status(500).json({ message: "Server error while calculating awards." });
  }
});


app.post("/api/register-principal",
  authenticateToken,
  isAdmin,
  registrationValidationRules(),
  validate,
  async (req, res) => {
    try {
      const { email, password } = req.body;
      const existingPrincipal = await Principal.findOne({ email });
      if (existingPrincipal) {
        return res.status(409).json({ message: "A Principal account with this email already exists." });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      const newPrincipal = new Principal({ email, password: hashedPassword });
      await newPrincipal.save();
      res.status(201).json({ success: true, message: "Principal registered successfully." });
    } catch (err) {
      console.error("Principal registration error:", err);
      res.status(500).json({ message: "Server error during Principal registration." });
    }
  });

app.get("/api/principal/stats", authenticateToken, isPrincipal, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayLogs = await Log.find({
      entryTime: { $gte: today, $lt: tomorrow }
    });

    // Calculate Peak Hour
    const hourCounts = {};
    todayLogs.forEach(log => {
      const hour = new Date(log.entryTime).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });
    let peakHour = null;
    let maxVisits = 0;
    for (const hour in hourCounts) {
      if (hourCounts[hour] > maxVisits) {
        maxVisits = hourCounts[hour];
        peakHour = parseInt(hour);
      }
    }
    const peakHourFormatted = peakHour !== null ? `${peakHour % 12 === 0 ? 12 : peakHour % 12}:00 ${peakHour < 12 ? 'AM' : 'PM'}` : 'N/A';

    // Calculate Department Counts
    const departmentCounts = await Log.aggregate([
      { $match: { entryTime: { $gte: today, $lt: tomorrow }, department: { $ne: null } } },
      { $group: { _id: "$department", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.status(200).json({
      totalVisitsToday: todayLogs.length,
      peakHour: peakHourFormatted,
      departmentCounts: departmentCounts
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching principal stats." });
  }
});

app.post("/api/login/unified", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  try {
    // Step 1: Check for Admin
    const admin = await Admin.findOne({ email });
    if (admin) {
      const match = await bcrypt.compare(password, admin.password);
      if (match) {
        const token = jwt.sign({ id: admin._id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '8h' });
        return res.json({ success: true, token, role: 'admin', email: admin.email });
      }
    }

    // Step 2: Check for Principal
    const principal = await Principal.findOne({ email });
    if (principal) {
      const match = await bcrypt.compare(password, principal.password);
      if (match) {
        const token = jwt.sign({ id: principal._id, role: 'principal' }, process.env.JWT_SECRET, { expiresIn: '8h' });
        return res.json({ success: true, token, role: 'principal', email: principal.email });
      }
    }

    // Step 3: Check for HOD
    const hod = await Hod.findOne({ email });
    if (hod) {
      const match = await bcrypt.compare(password, hod.password);
      if (match) {
        const token = jwt.sign({ id: hod._id, role: 'hod', department: hod.department }, process.env.JWT_SECRET, { expiresIn: '8h' });
        return res.json({ success: true, token, role: 'hod', department: hod.department, email: hod.email });
      }
    }

    // Step 4: Check for Assistant
    const assistant = await Assistant.findOne({ email });
    if (assistant) {
      const match = await bcrypt.compare(password, assistant.password);
      if (match) {
        const token = jwt.sign({ id: assistant._id, role: 'assistant' }, process.env.JWT_SECRET, { expiresIn: '8h' });
        return res.json({ success: true, token, role: 'assistant', email: assistant.email });
      }
    }

    // Step 5: If no user is found
    return res.status(401).json({ message: "Invalid credentials." });

  } catch (error) {
    console.error("Unified login error:", error);
    res.status(500).json({ message: "Server error during login." });
  }
});

// ✅ ADDED: New endpoint for generating custom reports
app.get('/api/reports', authenticateToken, isAdminOrPrincipal, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ message: "Start date and end date are required." });
    }

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Aggregation 1: Visits Over Time
    const visitsOverTime = await Log.aggregate([
      { $match: { entryTime: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$entryTime" } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Aggregation 2: Visitor Breakdown by Year of Study
    const visitorYearBreakdown = await Log.aggregate([
      { $match: { entryTime: { $gte: start, $lte: end }, designation: "Student" } },
      { $group: { _id: "$year", count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    res.status(200).json({ visitsOverTime, visitorYearBreakdown });

  } catch (error) {
    console.error("❌ Error generating reports:", error);
    res.status(500).json({ message: "Server error while generating reports." });
  }
});

app.post("/api/departments", async (req, res) => {
  try {
    const { code, name } = req.body;
    const dept = new Department({ code, name });
    await dept.save();
    res.json({ success: true, message: "Department added", dept });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get Departments
app.get("/api/departments", async (req, res) => {
  const depts = await Department.find();
  res.json(depts);
});

// Add Designation
app.post("/api/designations", async (req, res) => {
  try {
    const { code, name } = req.body;
    const desg = new Designation({ code, name });
    await desg.save();
    res.json({ success: true, message: "Designation added", desg });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get Designations
app.get("/api/designations", async (req, res) => {
  const desgs = await Designation.find();
  res.json(desgs);
});

app.post("/api/register-assistant", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required." });
    }

    const existing = await Assistant.findOne({ email });
    if (existing) {
      return res.status(409).json({ success: false, message: "An account with this email already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newAssistant = new Assistant({ email, password: hashedPassword });
    await newAssistant.save();

    res.status(201).json({ success: true, message: "Assistant registered successfully" });

  } catch (err) {
    console.error("❌ Assistant Registration error:", err);
    res.status(500).json({ success: false, message: "Server error during registration" });
  }
});

// in server.js, with your other API routes

// ===================================================================
// START: MESSAGING SYSTEM ENDPOINTS
// ===================================================================

// Endpoint for HODs and Principals to send a message
app.post('/api/messages', authenticateToken, async (req, res) => {
  const { message } = req.body;
  const { email, role } = req.user; // Get user details from JWT

  if (!message) {
    return res.status(400).json({ success: false, message: "Message content cannot be empty." });
  }

  // Allow only HODs and Principals to send messages
  if (role !== 'hod' && role !== 'principal') {
    return res.status(403).json({ success: false, message: "You do not have permission to send messages." });
  }

  try {
    const newMessage = new Message({
      senderEmail: email,
      senderRole: role,
      message: message
    });
    await newMessage.save();
    
    // Notify admins in real-time about the new message
    io.emit('newMessage');
    
    res.status(201).json({ success: true, message: "Message sent successfully." });
  } catch (error) {
    console.error("❌ Error sending message:", error);
    res.status(500).json({ success: false, message: "Server error while sending message." });
  }
});

// Endpoint for Admins to get all messages
app.get('/api/messages', authenticateToken, isAdmin, async (req, res) => {
  try {
    // Fetch newest messages first
    const messages = await Message.find().sort({ timestamp: -1 });
    res.status(200).json(messages);
  } catch (error) {
    console.error("❌ Error fetching messages:", error);
    res.status(500).json({ success: false, message: "Server error while fetching messages." });
  }
});

// Endpoint for Admins to mark a message as read
app.put('/api/messages/:id/read', authenticateToken, isAdmin, async (req, res) => {
  try {
    const message = await Message.findByIdAndUpdate(
      req.params.id,
      { isRead: true },
      { new: true }
    );
    if (!message) {
      return res.status(404).json({ success: false, message: "Message not found." });
    }
    io.emit('messageUpdate'); // Notify to update UI
    res.status(200).json({ success: true, message: "Message marked as read." });
  } catch (error) {
    console.error("❌ Error marking message as read:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
});


app.get('/api/sync-images', async (req, res) => {
    try {
        // Stop sending 'photoUrl' once you have encodings to save bandwidth
        const visitors = await Visitor.find({}, 'barcode faceEncoding').lean();
        res.json(visitors);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.put('/api/sync-encoding/:barcode', async (req, res) => {
    try {
        const { faceEncoding } = req.body;
        await Visitor.findOneAndUpdate(
            { barcode: req.params.barcode },
            { faceEncoding: faceEncoding }
        );
        res.status(200).send("✅ Signature saved");
    } catch (error) {
        res.status(500).send(error.message);
    }
});

// In server.js
app.put('/api/sync-encoding/:barcode', async (req, res) => {
    try {
        await Visitor.findOneAndUpdate(
            { barcode: req.params.barcode },
            { faceEncoding: req.body.faceEncoding }
        );
        res.status(200).send("✅ Signature Saved");
    } catch (error) {
        res.status(500).send(error.message);
    }
});


app.post('/api/logs/attendance', async (req, res) => {
    const { barcode } = req.body;
    try {
        // ✅ STEP 1: Use your MAIN decoding logic (the function you provided)
        const decodedInfo = await decodeBarcode(barcode);

        // ✅ STEP 2: Get Student Name from Visitor DB
        const visitor = await Visitor.findOne({ barcode });
        const studentName = visitor ? visitor.name : "Unknown";

        // ✅ STEP 3: Handle Entry/Exit (Same as manual)
        const activeLog = await Log.findOne({ barcode, exitTime: null });

        if (activeLog) {
            activeLog.exitTime = new Date();
            await activeLog.save();
        } else {
            const newLog = new Log({
                barcode: barcode,
                name: studentName,
                department: decodedInfo.department, // Decoded via your main function
                year: decodedInfo.year,             // Decoded via your main function
                designation: decodedInfo.designation, // Decoded via your main function
                entryTime: new Date(),
                date: new Date().toISOString().split('T')[0]
            });
            await newLog.save();
        }

        // ✅ STEP 4: "Shout" to the Frontend (Background Sync)
        const todayLogs = await Log.find({ 
            date: new Date().toISOString().split('T')[0] 
        }).sort({ entryTime: -1 });

        io.emit('attendanceUpdate', todayLogs); 

        res.json({ success: true, name: studentName });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.get('/api/logs/today', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        // Fetch logs for today, sorted by newest first
        const logs = await Log.find({ date: today }).sort({ entryTime: -1 });
        res.json(logs);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

const PYTHON_API_URL = process.env.PYTHON_API_URL || "http://localhost:5001";

// Wrap the execution in an async function
async function callPythonAPI(formData) {
  try {
    const response = await fetch(`${PYTHON_API_URL}/recognize`, {
      method: "POST",
      body: formData,
    });
    return await response.json();
  } catch (error) {
    console.error("Python API Error:", error);
  }
}


// server.listen(PORT, () => {
//   console.log(`🚀 Server running at port ${PORT}`);
// });

http.listen(5000, () => console.log("Server running on port 5000"));
