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

app.post("/upload-charts", upload.array("charts"), (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.json({ message: "Aucun fichier reçu." });
    }

    console.log("Graphiques reçus :", req.files.map(f => f.originalname));

    const files = req.files.map(f => f.path);

    const py = spawn("python3", ["moteur_sentinel.py", ...files]);

    py.stdout.on("data", data => console.log(data.toString()));
    py.stderr.on("data", err => console.error(err.toString()));

    py.on("close", code => {
        let globalData = null;
        if (fs.existsSync("output/global.json")) {
            try {
                globalData = JSON.parse(fs.readFileSync("output/global.json", "utf8"));
            } catch (e) {
                console.error("Erreur lecture global.json:", e);
            }
        }

        files.forEach(f => {
            try { fs.unlinkSync(f); } catch (e) {}
        });

        res.json({
            message: `${req.files.length} graphique(s) analysé(s) avec succès.`,
            data: globalData
        });
    });
});

app.get("/results/global", (req, res) => {
    if (fs.existsSync("output/global.json")) {
        res.sendFile(path.join(__dirname, "output/global.json"));
    } else {
        res.json([]);
    }
});

const PORT = 5000;
app.listen(PORT, "0.0.0.0", () => {
    console.log("Serveur SENTINEL FULL actif sur le port", PORT);
});
