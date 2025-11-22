// ---------------- AUTH CHECK ----------------
fetch("http://127.0.0.1:5000/auth_check")
    .then(r => r.json())
    .then(d => {
        if (d.status !== "ok") {
            window.location.href = "login.html";
        }
    });

// ---------------- LOGOUT BUTTON ----------------
document.getElementById("logoutBtn").onclick = async () => {
    await fetch("http://127.0.0.1:5000/logout");
    window.location.href = "login.html";
};

// ---------------- LOAD LOG DATA ----------------
async function loadLogs() {
    let response = await fetch("http://127.0.0.1:5000/logs");
    return await response.json();
}

// ---------------- DRAW CHARTS ----------------
loadLogs().then(data => {
    console.log("Loaded logs:", data);

    let riskCount = { Low:0, Medium:0, High:0, Emergency:0 };

    data.forEach(row => {
        if (riskCount[row.level] !== undefined) {
            riskCount[row.level]++;
        }
    });

    new Chart(document.getElementById("riskChart"), {
        type: "bar",
        data: {
            labels: ["Low", "Medium", "High", "Emergency"],
            datasets: [{
                label: "Risk Distribution",
                data: [
                    riskCount.Low,
                    riskCount.Medium,
                    riskCount.High,
                    riskCount.Emergency
                ]
            }]
        }
    });

    let diseaseCount = {};

    data.forEach(row => {
        let p = row.prediction;
        diseaseCount[p] = (diseaseCount[p] || 0) + 1;
    });

    new Chart(document.getElementById("conditionChart"), {
        type: "pie",
        data: {
            labels: Object.keys(diseaseCount),
            datasets: [{
                data: Object.values(diseaseCount)
            }]
        }
    });
});
