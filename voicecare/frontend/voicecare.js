// frontend/script.js - patched for real-time transcription + feedback

//// UI refs
const startBtn = document.getElementById('startBtn');
const analyzeBtn = document.getElementById('analyzeBtn');
const textInput = document.getElementById('textInput');
const reportArea = document.getElementById('reportArea');
const logArea = document.getElementById('logArea');
const downloadLog = document.getElementById('downloadLog');
const clearLog = document.getElementById('clearLog');

const API_ENDPOINT = 'http://127.0.0.1:5000/analyze';
let log = [];

// --- TEXT INPUT HANDLING ---
analyzeBtn.addEventListener('click', () => {
    const text = textInput.value.trim();
    if (text) {
        analyzeText(text);
    } else {
        speak("Please type or say your symptoms first.");
    }
});

async function analyzeText(text) {
    reportArea.innerHTML = '<p class="muted">Analyzing...</p>';

    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ utterance: text }),
        });

        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

        const result = await response.json();

        // Log the interaction
        log.unshift({
            timestamp: new Date().toLocaleTimeString(),
            input: text,
            result: {
                summary: result.verbal,
                prognosis: result.prognosis,
                level: result.level,
                vitals: result.vitals
            }
        });

        // Clear the input box after analysis
        textInput.value = '';

        renderReport(result);
        renderLog();

    } catch (error) {
        console.error('Analysis failed:', error);
        reportArea.innerHTML = `<p class="risk-high" style="padding: 12px;">🔴 Error: Could not connect to the backend server. Make sure 'api.py' is running and port 5000 is open. Details: ${error.message}</p>`;
        speak("I am sorry, the connection to the analysis server failed.");
    }
}

// --- VOICE INPUT HANDLING (interim results enabled) ---
let recognition;
if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
    recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (e) => {
        let interim = '';
        let finalTranscript = '';
        for (let i = 0; i < e.results.length; i++) {
            const res = e.results[i];
            if (res.isFinal) finalTranscript += res[0].transcript + ' ';
            else interim += res[0].transcript + ' ';
        }

        // show live transcript (final + interim)
        textInput.value = (finalTranscript + interim).trim();

        // analyze only when final transcript exists to avoid multiple calls
        if (finalTranscript.trim().length > 0) {
            analyzeText(finalTranscript.trim());
        }
    };

    recognition.onerror = (e) => {
        console.warn('Speech recognition error', e);
        speak("Sorry, I couldn't hear you. Please try again or type the issue.");
        startBtn.textContent = '🎙 Start Talking';
        startBtn.disabled = false;
        startBtn.dataset.listening = '0';
    };

    recognition.onend = () => {
        startBtn.textContent = '🎙 Start Talking';
        startBtn.disabled = false;
        startBtn.dataset.listening = '0';
    };

    // toggle listening on startBtn click
    startBtn.addEventListener('click', () => {
        if (startBtn.dataset.listening === '1') {
            recognition.stop();
            startBtn.dataset.listening = '0';
            startBtn.textContent = '🎙 Start Talking';
        } else {
            startBtn.dataset.listening = '1';
            startBtn.disabled = true; // will be re-enabled onend
            startBtn.textContent = '...Listening...';
            recognition.start();
        }
    });
} else {
    startBtn.disabled = true;
    startBtn.textContent = 'Voice Not Supported';
}

// --- UTILITY FUNCTIONS ---
function speak(text) {
    const utterance = new SpeechSynthesisUtterance(text);
    speechSynthesis.speak(utterance);
}

function renderReport(result) {
    const data = result;
    const prognosis = data.prognosis;
    const level = data.level;
    const advice = data.message;
    const vitals = data.vitals;

    let html = '';
    let color = data.level === 'High' ? 'var(--danger)' : (data.level === 'Medium' ? '#f59e0b' : 'var(--success)');

    html += `<div style="background-color: ${color}; padding: 16px; border-radius: 12px; margin-bottom: 20px;">
        <p style="margin:0; font-size: 14px; opacity: 0.8;">PROGNOSIS LEVEL</p>
        <h3 style="margin: 4px 0 8px; font-size: 24px;">${level} Risk</h3>
        <p style="margin:0; font-weight: 600;">Predicted Condition: ${prognosis}</p>
    </div>`;

    html += `<h4>📝 Suggested Advice</h4><p>${advice}</p>`;

    html += `<h4>📈 Vitals & Symptoms Analyzed</h4>`;
    html += `<div style="display:flex; flex-wrap:wrap; gap:10px; font-size:14px;">`;
    for (const [key, value] of Object.entries(vitals)) {
        html += `<span style="background:rgba(255,255,255,0.1); padding: 5px 10px; border-radius: 5px;">
            ${key.charAt(0).toUpperCase() + key.slice(1)}: <strong>${value}</strong>
        </span>`;
    }
    html += `</div>`;

    
    reportArea.innerHTML = html;
    speak(data.verbal);

    // attach feedback handlers
    const confirmBtn = document.getElementById('confirmBtn');
    const correctBtn = document.getElementById('correctBtn');
    if (confirmBtn) confirmBtn.addEventListener('click', () => sendFeedback(data, true));
    if (correctBtn) correctBtn.addEventListener('click', () => {
        const correct = prompt('Please type the correct diagnosis (e.g., Flu, Common Cold, Dengue):');
        if (correct && correct.trim().length > 0) sendFeedback(data, false, correct.trim());
    });
}

function renderLog(){
  if(log.length === 0){
    logArea.innerHTML = '<p class="muted">No log entries</p>';
    return;
  }
  logArea.innerHTML = log.slice(0,20).map(e=>`<div style="margin-bottom:8px"><small style="opacity:0.8">${e.timestamp}</small><br/><strong>${escapeHtml(e.input)}</strong><br/>${escapeHtml(e.result.summary)}</div>`).join('');
}

function escapeHtml(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }

// Feedback sender
function sendFeedback(report, confirmed=true, correctedLabel=null) {
    try {
        const payload = {
            utterance: report && report.vitals ? '' : (textInput.value || ''), // fallback
            predicted: report.prognosis || 'Unknown',
            level: report.level || 'Unknown',
            vitals: report.vitals || {},
            confirmed: confirmed,
            corrected: correctedLabel || ''
        };
        fetch('/feedback', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        }).then(r=>r.json()).then(j=>{
            speak(j.message || 'Thanks for the feedback');
        }).catch(e=>{
            console.warn('Feedback failed', e);
            alert('Unable to send feedback to server.');
        });
    } catch (e) { console.error(e); }
}

// Initial log render
renderLog();

// Log button handlers
downloadLog.addEventListener('click', () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(log, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", "voicecare_log.json");
    dlAnchorElem.click();
});

clearLog.addEventListener('click', () => {
    log = [];
    renderLog();
    localStorage.removeItem('voiceCareLog');
    speak("Interaction log cleared.");
});
