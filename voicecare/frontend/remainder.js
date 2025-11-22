/* ================== GLOBAL STATE ================== */

// Stores multiple medications
let medications = ["Metformin 500mg"]; 
let reminderTime = "18:00"; // HH:MM (24-hour)
let missedCount = 0;

let firstTimeout = null;   // first reminder timer
let dailyInterval = null;  // 24-hour repeat timer

// NEW: Tracks if voice is being used for setup or reminder confirmation
let recognitionMode = 'reminder'; // 'setup' or 'reminder'

const statusText = document.getElementById("statusText");
const listenButton = document.getElementById("listen");
const startReminderButton = document.getElementById("startReminder");

// UI element constants
const timeInput = document.getElementById("timeInput");
const newMedNameInput = document.getElementById("newMedName");
const addMedButton = document.getElementById("addMedBtn");
const medicationsListContainer = document.getElementById("medicationsList");
const medCountSpan = document.getElementById("medCount");
const addMedVoiceButton = document.getElementById("addMedVoiceBtn");


/* ================== INITIAL UI SETUP ================== */

window.addEventListener("load", () => {
  if (timeInput) timeInput.value = reminderTime;
  
  renderMedicationList();

  const msg =
    "Welcome to VoiceCare. Add your medicines and choose a time, then press 'Start Medication Reminder'.";
  statusText.innerHTML = msg;
  log(msg, "ok");
});

/* ================== MEDICATION MANAGEMENT UI ================== */

function renderMedicationList() {
    medicationsListContainer.innerHTML = '';
    medCountSpan.textContent = medications.length;

    if (medications.length === 0) {
        medicationsListContainer.innerHTML = '<p class="empty-list-msg">No medications added yet. Use the field below.</p>';
        return;
    }

    medications.forEach((med, index) => {
        const item = document.createElement('div');
        item.className = 'medication-item';
        item.innerHTML = `
            <span>${med}</span>
            <button data-index="${index}" class="remove-med-btn">X</button>
        `;
        medicationsListContainer.appendChild(item);
    });

    document.querySelectorAll('.remove-med-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const indexToRemove = parseInt(e.target.dataset.index);
            removeMedication(indexToRemove);
        });
    });
}

function addMedication(nameFromVoice = null) { 
    const name = nameFromVoice ? nameFromVoice.trim() : newMedNameInput.value.trim();

    if (name && !medications.includes(name)) {
        medications.push(name);
        newMedNameInput.value = ''; 
        renderMedicationList();
        log(`Added medication: ${name}`, 'normal');
        
        if (nameFromVoice) {
             speak(`${name} has been added to your reminder list.`);
        }
    } else if (name) {
        log(`Medication "${name}" is already in the list.`, 'warn');
        if (nameFromVoice) {
             speak(`I'm sorry, ${name} is already on your list.`);
        }
    } else if (nameFromVoice) {
         speak("Please say the name of the medicine you want to add, or say 'cancel'.");
    } else {
        log("Please enter a name for the medication.", 'warn');
    }
}

function removeMedication(index) {
    const medName = medications[index];
    medications.splice(index, 1);
    renderMedicationList();
    log(`Removed medication: ${medName}`, 'warn');
}

// Event listeners for keyboard input
addMedButton.addEventListener('click', () => addMedication());
newMedNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addMedication();
    }
});

// Event listener for the Voice Add button
addMedVoiceButton.addEventListener("click", () => {
    recognitionMode = 'setup'; // Set mode for adding medicine
    speak("Setup Mode activated. Please say the name of the medicine you want to add, for example, say 'Tylenol', or say 'cancel' to exit setup mode.");
    startRecognition();
});


/* ================== LOGGING FUNCTION ================== */

function log(text, type = "normal") {
  const box = document.getElementById("log");
  const time = new Date().toLocaleTimeString();
  box.innerHTML += `<div class="${type}">
    <span style="font-weight: 600;">${time}</span> — ${text}
  </div>`;
  box.scrollTop = box.scrollHeight;
}

/* ================== TEXT TO SPEECH ================== */

function speak(text) {
  if (!("speechSynthesis" in window)) {
    console.warn("Speech Synthesis not supported in this browser.");
    log("Speech Synthesis not supported in this browser.", "crit");
    return;
  }

  const msg = new SpeechSynthesisUtterance(text);
  msg.rate = 1;
  msg.pitch = 1;
  speechSynthesis.cancel();
  speechSynthesis.speak(msg);
}

/* ================== SPEECH RECOGNITION SETUP ================== */

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (!SpeechRecognition) {
  statusText.innerHTML =
    "❌ This browser does not support Speech Recognition. Please use Google Chrome on desktop.";
  log("SpeechRecognition API not supported.", "crit");
  listenButton.disabled = true;
  addMedVoiceButton.disabled = true;
} else {
  initRecognition();
}

function startRecognition() {
    if (!recognition) {
        log("Speech Recognition not initialized.", "crit");
        speak("I cannot listen because your browser does not support speech recognition.");
        return;
    }
    
    try {
        speechSynthesis.cancel();
        recognition.start();
    } catch (e) {
        if (e.name !== "InvalidStateError") {
            console.error("Error starting recognition:", e);
            log("Error starting recognition: " + e.message, "crit");
        }
    }
}


function initRecognition() {
  recognition = new SpeechRecognition();
  recognition.lang = "en-IN";
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart = () => {
    if (recognitionMode === 'setup') {
        statusText.innerHTML = "🎤 Listening (Setup Mode)... Say medicine name or 'cancel'.";
    } else {
        statusText.innerHTML = "🎤 Listening (Reminder Mode)... Say 'Done' or 'Repeat'.";
    }
  };

  recognition.onerror = (event) => {
    console.warn("Speech error:", event.error);
    
    // Only reset status if it wasn't a permissions error
    if (event.error !== "not-allowed" && event.error !== "service-not-allowed") {
        statusText.innerHTML = `Idle (Error: ${event.error}. Tap mic to speak again)`;
    }
    
    log(`⚠ Speech error: ${event.error}`, "warn");

    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      const msg = `Microphone access is denied for ${location.origin}. Click the lock or "Not secure" icon in the address bar, go to Site settings → Microphone → Allow, then reload the page.`;
      statusText.innerHTML = "🚫 Permission Denied! Allow microphone in browser settings.";
      log(msg, "crit");
      speak(
        "Microphone access is blocked. Please allow microphone for this website in the browser address bar and reload the page."
      );
    }

    if (event.error === "no-speech") {
      log("No speech detected. Asking user to repeat if in setup mode.", "warn");
      if (recognitionMode === 'setup') {
         speak("I didn't hear you. Please say the name of the medicine, or say 'cancel'.");
      }
    }
    
    // End of recognition
    recognitionMode = 'reminder';
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript.toLowerCase().trim();
    log(`User said: "${transcript}"`);

    // --- SETUP MODE LOGIC (for adding medicine) ---
    if (recognitionMode === 'setup') {
        // Allow the user to cancel
        if (transcript === 'cancel' || transcript === 'stop' || transcript === 'exit') {
            speak("Setup mode cancelled.");
            log("Setup mode cancelled by voice.", "normal");
            return;
        }
        
        // Simple command to add the medicine
        // We look for "add" but then take whatever follows it
        if (transcript.startsWith("add ")) {
             const medName = transcript.substring(4).trim();
             addMedication(medName);
        } else {
            // Assume the entire transcript is the medicine name
            addMedication(transcript);
        }
    } 
    
    // --- REMINDER MODE LOGIC (for confirmation) ---
    else if (recognitionMode === 'reminder') {
        if (transcript.includes("done") || transcript.includes("taken")) {
            confirmMedication();
        } else if (transcript.includes("repeat")) {
            speak("Repeating the reminder.");
            sendReminder();
        } else {
            speak(
                "I did not understand. In Reminder Mode, please say 'done' or 'repeat'."
            );
            log("Unrecognized command from patient in Reminder Mode.", "warn");
        }
    }
  };

  recognition.onend = () => {
    recognitionMode = 'reminder'; // Always reset to reminder mode after recognition stops
    if (statusText.innerHTML.includes("Listening")) {
      statusText.innerHTML = "Idle (Tap mic to speak)";
    }
  };
}

/* ================== LISTEN BUTTON (PATIENT RESPONSE) ================== */

// Existing button repurposed for reminder response
listenButton.addEventListener("click", () => {
    recognitionMode = 'reminder'; // Set mode for reminder response
    startRecognition();
});

/* ================== TIME PARSING & REMINDER LOGIC ================== */

function getNextReminderDateFromTimeInput(hhmm) {
  const now = new Date();
  const [hStr, mStr] = hhmm.split(":");
  if (!hStr || !mStr) throw new Error("Invalid time format");

  const hours = parseInt(hStr, 10);
  const minutes = parseInt(mStr, 10);

  const target = new Date();
  target.setHours(hours, minutes, 0, 0);

  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }

  return target;
}

function sendReminder() {
  if (medications.length === 0) {
      speak("Reminder check completed. No medications are currently scheduled.");
      log("No medications scheduled.", "normal");
      return;
  }
  
  const now = new Date();
  const timeReadable = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  
  let medList;
  if (medications.length === 1) {
    medList = medications[0];
  } else {
    medList = medications.slice(0, -1).join(', then ') + ', and ' + medications.slice(-1);
  }

  const message = `It is ${timeReadable}. Please take your medications: ${medList}. Say 'Done' or 'Taken' when you are finished.`;

  speak(message);
  log(`Reminder sent for: ${medList}`);

  missedCount++;

  if (missedCount === 2) {
    speak(
      "Second reminder: You still have not confirmed taking your medicine. Please confirm now."
    );
    log("⚠ Second reminder issued. Awaiting confirmation.", "warn");
    statusText.innerHTML = "⚠ Awaiting confirmation from patient.";
  }

  if (missedCount >= 3) {
    speak(
      "Alert: Too many missed confirmations. Please contact your doctor or caregiver immediately."
    );
    log("🚨 Escalation triggered: too many missed doses.", "crit");
    statusText.innerHTML = "🚨 CRITICAL ALERT: Multiple missed doses.";
  }
}

function confirmMedication() {
  speak("Great job. I have recorded your confirmation. Stay healthy!");
  missedCount = 0;
  statusText.innerHTML = "✔ Medications confirmed. Waiting for the next reminder.";
  log("Medications confirmed by patient.", "ok");
}

/* ================== START REMINDER BUTTON ================== */

startReminderButton.addEventListener("click", () => {
  // 1. Get values from UI
  const timeValue = timeInput.value.trim(); 

  if (medications.length === 0) {
    log("Please add at least one medicine before starting the reminder.", "warn");
    speak("Please add at least one medicine before starting the reminder.");
    newMedNameInput.focus();
    return;
  }

  if (!timeValue) {
    log("Please choose a time for the reminder.", "warn");
    speak("Please choose a time for the reminder.");
    timeInput.focus();
    return;
  }

  reminderTime = timeValue;

  // 2. Clear old timers if any
  if (firstTimeout) {
    clearTimeout(firstTimeout);
    firstTimeout = null;
  }
  if (dailyInterval) {
    clearInterval(dailyInterval);
    dailyInterval = null;
  }

  // 3. Schedule next reminder
  let next;
  try {
    next = getNextReminderDateFromTimeInput(reminderTime);
  } catch (e) {
    log("Invalid time format. Please pick a valid time from the time picker.", "crit");
    speak("The reminder time format is invalid. Please choose a time from the time picker.");
    return;
  }

  const now = new Date();
  const delayMs = next - now;
  const nextTimeReadable = next.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const startMsg = `VoiceCare reminder system activated. I will remind you to take ${medications.length} medications at ${nextTimeReadable} every day.`;
  speak(startMsg);
  statusText.innerHTML = `⏰ Reminder scheduled for ${nextTimeReadable} (${medications.length} meds).`;
  document.getElementById("log").innerHTML = "";
  log(startMsg, "ok");

  missedCount = 0;

  // 4. First reminder at exact time
  firstTimeout = setTimeout(() => {
    sendReminder();

    // Then repeat every 24 hours
    const dayMs = 24 * 60 * 60 * 1000;
    dailyInterval = setInterval(sendReminder, dayMs);
    log("Daily reminder interval started (every 24 hours).", "normal");
  }, delayMs);

  const minutesUntil = Math.round(delayMs / 60000);
  log(`First reminder will fire in about ${minutesUntil} minute(s).`, "normal");
});
