const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const app = express();
const upload = multer({ dest: "uploads/" });

fs.mkdirSync("results", { recursive: true });
fs.mkdirSync("output", { recursive: true });
fs.mkdirSync("uploads", { recursive: true });
fs.mkdirSync("public", { recursive: true });

app.use(express.static(path.join(__dirname, "public")));

function runPython(script, args) {
    return new Promise((resolve, reject) => {
        const py = spawn("python3", [script, ...args]);
        let stdout = "";
        let stderr = "";
        py.stdout.on("data", d => { stdout += d.toString(); });
        py.stderr.on("data", d => { stderr += d.toString(); });
        py.on("close", code => {
            if (stdout) console.log(`[${script}]`, stdout.trim());
            if (stderr) console.error(`[${script} ERR]`, stderr.trim());
            resolve({ code, stdout, stderr });
        });
        py.on("error", reject);
    });
}

function readJSON(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (e) {
        return null;
    }
}

// --- Phase 0 : lecture avancée d'un graphique unique ---
app.post("/upload-graph", upload.single("chart"), async (req, res) => {
    if (!req.file) {
        return res.json({ valid: false, errors: ["Aucun fichier reçu."], levels: {}, fibo: {} });
    }

    const inputPath = req.file.path;
    const outputPath = `output/phase0_${Date.now()}.json`;

    try {
        await runPython("phase0_reader.py", [inputPath, outputPath]);
        const result = readJSON(outputPath) || { valid: false, errors: ["Erreur de lecture."], levels: {}, fibo: {} };
        try { fs.unlinkSync(inputPath); } catch (e) {}
        try { fs.unlinkSync(outputPath); } catch (e) {}
        res.json(result);
    } catch (err) {
        console.error("Erreur Phase 0 :", err);
        try { fs.unlinkSync(inputPath); } catch (e) {}
        res.status(500).json({ valid: false, errors: ["Erreur serveur."], levels: {}, fibo: {} });
    }
});

app.post("/upload-charts", upload.array("charts"), async (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.json({ message: "Aucun fichier reçu." });
    }

    console.log("Graphiques reçus :", req.files.map(f => f.originalname));

    const filePaths = req.files.map(f => f.path);

    try {
        // --- Phase OCR : moteur_sentinel.py ---
        await runPython("moteur_sentinel.py", filePaths);
        const rawResults = readJSON("output/global.json") || [];

        // --- Phase A : validation.py ---
        fs.writeFileSync("output/global.json", JSON.stringify(rawResults, null, 2));
        await runPython("validation.py", ["output/global.json"]);
        const validated = readJSON("output/validated.json") || [];

        const validCount = validated.filter(g => g.valid).length;
        if (validCount === 0) {
            return res.json({
                message: "Aucun graphique valide après validation.",
                phase: "A",
                errors: validated.map(g => ({ fichier: g.fichier, errors: g.errors })),
                decision: null,
            });
        }

        // --- Phase B : fusion.py ---
        await runPython("fusion.py", ["output/validated.json"]);
        const fusion = readJSON("output/fusion.json") || {};

        if (fusion.rejected) {
            return res.json({
                message: `Setup rejeté — score confluence : ${fusion.confluence_score}/100`,
                phase: "B",
                fusion,
                decision: null,
            });
        }

        // --- Phase C : decision.py ---
        await runPython("decision.py", ["output/fusion.json"]);
        const decision = readJSON("output/decision_ready_for_gpt.json") || {};

        filePaths.forEach(f => { try { fs.unlinkSync(f); } catch (e) {} });

        res.json({
            message: `${req.files.length} graphique(s) analysé(s) — ${validCount} valide(s). Score : ${fusion.confluence_score}/100.`,
            phase: "C",
            validated_count: validCount,
            confluence_score: fusion.confluence_score,
            decision,
        });

    } catch (err) {
        console.error("Erreur pipeline SENTINEL :", err);
        filePaths.forEach(f => { try { fs.unlinkSync(f); } catch (e) {} });
        res.status(500).json({ message: "Erreur interne du moteur SENTINEL.", error: err.message });
    }
});

app.get("/results/decision", (req, res) => {
    const data = readJSON("output/decision_ready_for_gpt.json");
    res.json(data || {});
});

app.get("/results/fusion", (req, res) => {
    const data = readJSON("output/fusion.json");
    res.json(data || {});
});

app.get("/results/validated", (req, res) => {
    const data = readJSON("output/validated.json");
    res.json(data || []);
});

const PORT = 5000;
app.listen(PORT, "0.0.0.0", () => {
    console.log("Serveur SENTINEL FULL actif sur le port", PORT);
});
