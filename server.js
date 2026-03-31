const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const app = express();
const upload = multer({ dest: "uploads/" });

fs.mkdirSync("results",  { recursive: true });
fs.mkdirSync("output",   { recursive: true });
fs.mkdirSync("uploads",  { recursive: true });
fs.mkdirSync("public",   { recursive: true });

app.use(express.static(path.join(__dirname, "public")));

// ---- Helpers ----

function runPython(script, args) {
    return new Promise((resolve, reject) => {
        const py = spawn("python3", [script, ...args]);
        let out = "", err = "";
        py.stdout.on("data", d => { out += d.toString(); });
        py.stderr.on("data", d => { err += d.toString(); });
        py.on("close", code => {
            if (out) console.log(`[${script}]`, out.trim());
            if (err) console.error(`[${script}!]`, err.trim());
            resolve({ code, out, err });
        });
        py.on("error", reject);
    });
}

function readJSON(filePath) {
    try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
    catch (e) { return null; }
}

function cleanup(...paths) {
    paths.forEach(p => { try { fs.unlinkSync(p); } catch (e) {} });
}

// Run the full A→C pipeline on a set of uploaded files.
// Uses tag-based temp output files to avoid collisions.
async function runPipeline(filePaths, tag) {
    const gPath = `output/g_${tag}.json`;
    const vPath = `output/v_${tag}.json`;
    const fPath = `output/f_${tag}.json`;
    const dPath = `output/d_${tag}.json`;

    try {
        // OCR
        await runPython("moteur_sentinel.py", filePaths);
        const raw = readJSON("output/global.json") || [];
        fs.writeFileSync(gPath, JSON.stringify(raw, null, 2));

        // Phase A — Validation
        await runPython("validation.py", [gPath, vPath]);
        const validated = readJSON(vPath) || [];
        const validCount = validated.filter(g => g.valid).length;

        if (validCount === 0) {
            return { ok: false, phase: "A", validated, validCount };
        }

        // Phase B — Fusion
        await runPython("fusion.py", [vPath, fPath]);
        const fusion = readJSON(fPath) || {};
        if (fusion.rejected) {
            return { ok: false, phase: "B", fusion };
        }

        // Phase C — Decision
        await runPython("decision.py", [fPath, dPath]);
        const decision = readJSON(dPath) || {};

        // Attach Volume Profile as plain object for canvas drawing
        const htfVP = fusion?.HTF?.volume_profile || {};
        decision.justification = decision.justification || {};
        decision.justification.volume_profile = htfVP;

        // Persist canonical outputs
        fs.copyFileSync(gPath, "output/global.json");
        fs.copyFileSync(vPath, "output/validated.json");
        fs.copyFileSync(fPath, "output/fusion.json");
        fs.copyFileSync(dPath, "output/decision_ready_for_gpt.json");

        return { ok: true, phase: "C", validCount, fusion, decision };

    } finally {
        cleanup(gPath, vPath, fPath, dPath);
    }
}

// ============================================================
// /upload-phase0  →  Phase 0 OCR reader only (phase0.html)
// ============================================================
app.post("/upload-phase0", upload.single("chart"), async (req, res) => {
    if (!req.file) {
        return res.json({ valid: false, errors: ["Aucun fichier reçu."], levels: {}, fibo: {} });
    }
    const inPath  = req.file.path;
    const outPath = `output/p0_${Date.now()}.json`;
    try {
        await runPython("phase0_reader.py", [inPath, outPath]);
        const result = readJSON(outPath) || { valid: false, errors: ["Erreur OCR."], levels: {}, fibo: {} };
        cleanup(inPath, outPath);
        res.json(result);
    } catch (err) {
        cleanup(inPath);
        res.status(500).json({ valid: false, errors: ["Erreur serveur."], levels: {}, fibo: {} });
    }
});

// ============================================================
// /upload-graph  →  single file → full pipeline → decision JSON
// (used by new index.html multi-chart view)
// ============================================================
app.post("/upload-graph", upload.single("chart"), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ setup_valid: false, error: "Aucun fichier reçu." });
    }
    const filePath = req.file.path;
    const tag = `sg_${Date.now()}`;
    try {
        const result = await runPipeline([filePath], tag);
        cleanup(filePath);

        if (!result.ok && result.phase === "A") {
            const errors = (result.validated || []).flatMap(g => g.errors || []);
            return res.json({
                setup_valid: false, bias: "range", entry_zone: [], stop_loss: null,
                take_profit: [], invalidation: "Graphique invalide — " + errors.join(", "),
                risk_reward: "N/A", confidence_score: 0,
                justification: { order_blocks: "Non calculé", fibonacci: "Non calculé",
                    volume_profile: {}, cvd: "Non calculé", structure: "Non calculé", obpi: "Non calculé" }
            });
        }
        if (!result.ok && result.phase === "B") {
            return res.json({
                setup_valid: false, bias: "range", entry_zone: [], stop_loss: null,
                take_profit: [], invalidation: result.fusion?.rejection_reason || "Score insuffisant",
                risk_reward: "N/A", confidence_score: result.fusion?.confluence_score || 0,
                justification: { order_blocks: "Non calculé", fibonacci: "Non calculé",
                    volume_profile: {}, cvd: "Non calculé", structure: "Non calculé", obpi: "Non calculé" }
            });
        }

        res.json(result.decision);

    } catch (err) {
        cleanup(filePath);
        console.error("Erreur /upload-graph :", err);
        res.status(500).json({ setup_valid: false, error: err.message });
    }
});

// ============================================================
// /upload-charts  →  multi-file full pipeline (pipeline page)
// ============================================================
app.post("/upload-charts", upload.array("charts"), async (req, res) => {
    if (!req.files || !req.files.length) {
        return res.json({ message: "Aucun fichier reçu." });
    }
    console.log("Graphiques reçus :", req.files.map(f => f.originalname));
    const filePaths = req.files.map(f => f.path);
    const tag = `mc_${Date.now()}`;
    try {
        const result = await runPipeline(filePaths, tag);
        cleanup(...filePaths);

        if (!result.ok && result.phase === "A") {
            return res.json({
                message: "Aucun graphique valide après validation.",
                phase: "A",
                errors: (result.validated || []).map(g => ({ fichier: g.fichier, errors: g.errors })),
                decision: null,
            });
        }
        if (!result.ok && result.phase === "B") {
            return res.json({
                message: `Setup rejeté — score confluence : ${result.fusion.confluence_score}/100`,
                phase: "B", fusion: result.fusion, decision: null,
            });
        }

        res.json({
            message: `${req.files.length} graphique(s) analysé(s) — ${result.validCount} valide(s). Score : ${result.fusion.confluence_score}/100.`,
            phase: "C", validated_count: result.validCount,
            confluence_score: result.fusion.confluence_score,
            decision: result.decision,
        });

    } catch (err) {
        cleanup(...filePaths);
        console.error("Erreur pipeline SENTINEL :", err);
        res.status(500).json({ message: "Erreur interne.", error: err.message });
    }
});

// ============================================================
// Read-only endpoints
// ============================================================
app.get("/results/decision",  (req, res) => res.json(readJSON("output/decision_ready_for_gpt.json") || {}));
app.get("/results/fusion",    (req, res) => res.json(readJSON("output/fusion.json") || {}));
app.get("/results/validated", (req, res) => res.json(readJSON("output/validated.json") || []));

const PORT = 5000;
app.listen(PORT, "0.0.0.0", () => console.log("Serveur SENTINEL FULL actif sur le port", PORT));
