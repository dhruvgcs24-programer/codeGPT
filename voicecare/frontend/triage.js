// ---------------- CONFIG ----------------
fetch("http://127.0.0.1:5000/auth_check")
    .then(res => res.json())
    .then(data => {
        if (data.status !== "ok") {
            window.location.href = "login.html";
        }
    });

const API_URL = "http://127.0.0.1:5000/analyze";
const SAVE_LOG_URL = "http://127.0.0.1:5000/save_log";

let recognition;

// ---------------- VOICE INPUT SETUP ----------------
if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
    recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
        const text = event.results[0][0].transcript.toLowerCase();
        console.log("Voice Input:", text);

        if (isCommand(text)) {
            handleCommand(text);
        } else {
            sendTriage(text);
        }
    };
}

document.getElementById("voiceBtn").onclick = () => {
    if (recognition) recognition.start();
};

// ---------------- DATA STORAGE ----------------
let stats = { Low: 0, Medium: 0, High: 0, Emergency: 0 };
let triageRows = [];

// ---------------- SUMMARY COUNTER ----------------
function updateSummary(level) {
    stats[level]++;
    document.getElementById("countLow").textContent = stats.Low;
    document.getElementById("countMed").textContent = stats.Medium;
    document.getElementById("countHigh").textContent = stats.High;
    document.getElementById("countEmer").textContent = stats.Emergency;
}

// ---------------- MAIN TRIAGE SEND ----------------
async function sendTriage(text) {
    const body = { utterance: text };

    const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });

    const result = await res.json();

    const row = {
        time: new Date().toLocaleTimeString(),
        symptoms: text,
        prediction: result.prognosis,
        level: result.level,
        vitals: result.vitals
    };

    triageRows.unshift(row);
    updateSummary(result.level);
    renderTable(triageRows);

    await fetch(SAVE_LOG_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(row)
    });
}

// ---------------- RENDER TABLE ----------------
function renderTable(data) {
    const tbody = document.querySelector("#triageTable tbody");
    tbody.innerHTML = "";

    // If the data array is empty, the table body will be cleared (no report shown)
    data.forEach((row) => {
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td>${row.time}</td>
            <td>${row.symptoms}</td>
            <td>${row.prediction}</td>
            <td><span class="status ${row.level.toLowerCase()}">${row.level}</span></td>
        `;

        tbody.appendChild(tr);
    });
}

// ------------------- VOICE COMMAND DETECTOR -------------------
function isCommand(txt) {
    return (
        txt.includes("show") ||
        txt.includes("sort") ||
        txt.includes("clear") ||
        txt.includes("search") ||
        txt.includes("find") ||
        txt.includes("increase") ||
        txt.includes("decrease")
    );
}

// ------------------- VOICE COMMAND HANDLER -------------------
function handleCommand(cmd) {
    let results = triageRows;
    let spokenPhrase = "Showing all patient cases.";

    // ===================== RISK FILTERS ======================
    if (cmd.includes("show patients with emergency")) {
        results = triageRows.filter(r => r.level === "Emergency");
        spokenPhrase = "Showing patients with emergency cases.";
    } else if (cmd.includes("show patients with high ")) {
        results = triageRows.filter(r => r.level === "High");
        spokenPhrase = "Showing patients with high risk cases.";
    } else if (cmd.includes("show patients with medium")) {
        results = triageRows.filter(r => r.level === "Medium");
        spokenPhrase = "Showing patients with medium risk cases.";
    } else if (cmd.includes("show patients with low")) {
        results = triageRows.filter(r => r.level === "Low");
        spokenPhrase = "Showing patients with low risk cases.";
    } else if (cmd.includes("show all patients")) {
        results = triageRows;
        spokenPhrase = "Showing all patient cases.";
    // ===================== UTTERANCE FILTERS ======================
    } else {
        const utteranceKeywords = [
            "fever", "temperature", "cough", "cold", "sore throat",
            "breath", "breathing", "oxygen", "spo2",
            "chest pain", "pain", "cramps",
            "vomiting", "nausea", "diarrhea",
            "headache", "migraine",
            "fatigue", "tired",
            "dengue", "covid"
        ];

        for (let key of utteranceKeywords) {
            if (cmd.includes(key)) {
                results = triageRows.filter(r => r.symptoms.toLowerCase().includes(key));
                spokenPhrase = `Showing patients with ${key} in their symptoms.`;
                renderAndSpeak(results, spokenPhrase);
                return;
            }
        }
    
        // ===================== PREDICTION FILTERS ======================
        const predictionKeywords = [
            "dengue", "flu", "pneumonia", "migraine", "heart attack",
            "stroke", "covid", "asthma", "infection", "food poisoning"
        ];

        for (let key of predictionKeywords) {
            if (cmd.includes(key)) {
                results = triageRows.filter(r => r.prediction.toLowerCase().includes(key));
                spokenPhrase = `Showing prediction results for ${key}.`;
                renderAndSpeak(results, spokenPhrase);
                return;
            }
        }
    }
    
    // ===================== SORT COMMANDS ======================
    if (cmd.includes("sort by severity") || cmd.includes("sort by risk")) {
        const order = { Emergency: 4, High: 3, Medium: 2, Low: 1 };
        results.sort((a, b) => order[b.level] - order[a.level]);
        spokenPhrase = "Sorted by severity.";
        renderAndSpeak(results, spokenPhrase);
        return;
    }
    
    // Sort by Time (Newest First, consistent with unshift)
    if (cmd.includes("sort by time")) {
        // Since triageRows is kept in reverse chronological order (newest first), 
        // a simple reversal of a temporary filtered list is not necessary if we use the default list.
        // To ensure consistency, we'll just re-render the current list or apply a time sort if needed.
        // The default view is already sorted by time (newest first).
        spokenPhrase = "Sorted by time, newest cases first.";
        renderAndSpeak(results, spokenPhrase);
        return;
    }

    // ===================== CLEAR COMMAND ======================
    if (cmd.includes("clear dashboard") || cmd.includes("clear table")) {
        triageRows = [];
        renderTable([]);
        speak("Dashboard cleared.");
        return;
    }

    // ===================== SEARCH COMMAND ======================
    if (cmd.includes("search") || cmd.includes("find")) {
        let keyword = cmd.replace("search", "")
            .replace("find", "")
            .trim();

        results = triageRows.filter(r =>
            r.symptoms.toLowerCase().includes(keyword) ||
            r.prediction.toLowerCase().includes(keyword)
        );

        spokenPhrase = results.length > 0 ? `Showing search results for ${keyword}.` : `No results found for ${keyword}.`;
        renderAndSpeak(results, spokenPhrase);
        return;
    }

    // ===================== UI COMMANDS ======================
    if (cmd.includes("increase text")) {
        document.body.style.fontSize = "18px";
        speak("Increasing text size.");
        return;
    }

    if (cmd.includes("decrease text")) {
        document.body.style.fontSize = "14px";
        speak("Decreasing text size.");
        return;
    }

    // If a filter was applied successfully above, render and speak.
    // Otherwise, assume it was a non-filter command or unrecognized.
    if (results.length === 0 && (cmd.includes("show") || cmd.includes("search") || cmd.includes("find"))) {
        speak("No patients found matching your request.");
    } else {
        // If a valid filter was applied or 'show all' was requested
        renderTable(results);
        speak(spokenPhrase);
    }
}

// Helper function to render table and speak, especially after filters
function renderAndSpeak(results, spokenPhrase) {
    renderTable(results);
    if (results.length === 0) {
        speak("No patients found matching your request.");
    } else {
        speak(spokenPhrase);
    }
}


// ------------------- SPEAK FUNCTION -------------------
function speak(text) {
    const talk = new SpeechSynthesisUtterance(text);
    speechSynthesis.speak(talk);
}

// ---------------- PRELOAD SAMPLE DATA ----------------
window.onload = function () {

    const samplePatients = [
        {
            time: "10:12 AM",
            symptoms: "Fever 102 with cough and fatigue",
            prediction: "Flu",
            level: "Medium",
            vitals: { temp: 102, cough: 1, fatigue: 1 }
        },
        {
            time: "10:25 AM",
            symptoms: "Chest pain and shortness of breath",
            prediction: "Heart Attack",
            level: "Emergency",
            vitals: { shortness_breath: 1 }
        },
        {
            time: "10:40 AM",
            symptoms: "Migraine with flashing lights",
            prediction: "Migraine",
            level: "Medium",
            vitals: { headache: 1, aura: 1 }
        },
        {
            time: "11:00 AM",
            symptoms: "Oxygen level is 88",
            prediction: "Pneumonia",
            level: "High",
            vitals: { spo2: 88 }
        },
        {
            time: "11:15 AM",
            symptoms: "Vomiting and diarrhea",
            prediction: "Food Poisoning",
            level: "Medium",
            vitals: { vomiting:  1, diarrhea: 1 }
        },
        {
            time: "11:45 AM",
            symptoms: "Headache",
            prediction: "Migraine",
            level: "Low",
            vitals: { headache: 1 }
        }
    ];

    triageRows = samplePatients;
    renderTable(triageRows);

    // Update summary boxes
    for (let p of samplePatients) {
        updateSummary(p.level);
    }
};